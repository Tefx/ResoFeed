package resofeed

import (
	"bytes"
	"fmt"
	"io"
	"io/fs"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"
	"time"
)

func TestMain(m *testing.M) {
	if strings.Contains(testRunFilter(), "TestRFBUG003EmbeddedUIContract") {
		if err := runEmbeddedBinaryProbes(); err != nil {
			_, _ = fmt.Fprintf(os.Stderr, "RF-BUG-003 binary probes failed: %v\n", err)
			os.Exit(1)
		}
		fmt.Println("RF_BUG_003_BINARY_PROBES=3")
	}
	os.Exit(m.Run())
}

func TestEmbeddedUIBootstrapValidation(t *testing.T) {
	if err := validateEmbeddedUI(); err != nil {
		t.Fatalf("validate packaged production UI: %v", err)
	}
	validFiles := fstest.MapFS{
		"_app/start.js": {Data: []byte("export const ready = true")},
		"app.css":       {Data: []byte("body{}")},
		"favicon.svg":   {Data: []byte("<svg></svg>")},
	}
	valid := `<!doctype html><link rel="icon" href="/favicon.svg"><link rel="stylesheet" href="/app.css"><script type="application/json">{"safe":true}</script><script type="module">import("/_app/start.js")</script>`
	if err := validateUIBootstrap(validFiles, valid); err != nil {
		t.Fatalf("validate production bootstrap: %v", err)
	}

	for name, document := range map[string]string{
		"missing executable": `<!doctype html><script type="application/json">{}</script>`,
		"empty executable":   "<!doctype html><script type=\"module\">\r\n\r</script>",
		"missing reference":  `<!doctype html><script src="/_app/missing.js"></script>`,
		"external reference": `<!doctype html><script src="https://example.test/app.js"></script>`,
	} {
		t.Run(name, func(t *testing.T) {
			if err := validateUIBootstrap(validFiles, document); err == nil {
				t.Fatalf("invalid bootstrap was accepted")
			}
		})
	}
}

func TestEmbeddedStaticHandlerSemantics(t *testing.T) {
	if err := validateEmbeddedUI(); err != nil {
		t.Fatalf("validate embedded UI: %v", err)
	}
	handler := staticUIHandler()
	root := serveEmbeddedRequest(handler, http.MethodGet, "/")
	if root.Code != http.StatusOK || !strings.Contains(root.Body.String(), "_app/immutable/") {
		t.Fatalf("GET / status=%d body=%q", root.Code, root.Body.String())
	}

	refs := moduleImportPattern.FindAllStringSubmatch(root.Body.String(), -1)
	if len(refs) == 0 {
		t.Fatal("embedded index has no generated module reference")
	}
	asset := serveEmbeddedRequest(handler, http.MethodGet, refs[0][1])
	if asset.Code != http.StatusOK || asset.Body.Len() == 0 {
		t.Fatalf("GET generated asset status=%d bytes=%d", asset.Code, asset.Body.Len())
	}

	for _, target := range []string{"/today", "/source-ledger", "/search", "/items/opaque-item-id"} {
		response := serveEmbeddedRequest(handler, http.MethodGet, target)
		if response.Code != http.StatusOK || !bytes.Equal(response.Body.Bytes(), root.Body.Bytes()) {
			t.Errorf("GET %s status=%d did not return embedded index", target, response.Code)
		}
	}

	head := serveEmbeddedRequest(handler, http.MethodHead, "/_app/immutable/missing.js")
	if head.Code != http.StatusNotFound || head.Body.Len() != 0 {
		t.Errorf("HEAD static miss status=%d bytes=%d", head.Code, head.Body.Len())
	}
	unknown := serveEmbeddedRequest(handler, http.MethodGet, "/unknown-route")
	if unknown.Code != http.StatusNotFound || strings.Contains(strings.ToLower(unknown.Body.String()), "<!doctype html") {
		t.Errorf("unknown route status=%d returned SPA HTML", unknown.Code)
	}
}

func TestEmbeddedBinaryArbitraryWorkingDirectory(t *testing.T) {
	if err := runEmbeddedBinaryProbes(); err != nil {
		t.Fatal(err)
	}
	t.Log("RF_BUG_003_BINARY_PROBES=3")
}

func serveEmbeddedRequest(handler http.Handler, method, target string) *httptest.ResponseRecorder {
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest(method, target, nil))
	return recorder
}

func testRunFilter() string {
	for index, arg := range os.Args {
		if arg == "-test.run" && index+1 < len(os.Args) {
			return os.Args[index+1]
		}
		if strings.HasPrefix(arg, "-test.run=") {
			return strings.TrimPrefix(arg, "-test.run=")
		}
	}
	return ""
}

func runEmbeddedBinaryProbes() error {
	repoRoot, err := filepath.Abs(filepath.Join("..", ".."))
	if err != nil {
		return fmt.Errorf("resolve repository root: %w", err)
	}
	tempRoot, err := os.MkdirTemp("", "resofeed-embedded-ui-probes-")
	if err != nil {
		return fmt.Errorf("create binary probe directory: %w", err)
	}
	defer func() { _ = os.RemoveAll(tempRoot) }()

	binary := filepath.Join(tempRoot, "resofeed")
	build := exec.Command("go", "build", "-o", binary, "./cmd/resofeed")
	build.Dir = repoRoot
	if output, err := build.CombinedOutput(); err != nil {
		return fmt.Errorf("build binary: %w: %s", err, strings.TrimSpace(string(output)))
	}

	workdirs := []string{repoRoot, filepath.Join(tempRoot, "cwd"), string(filepath.Separator)}
	if err := os.MkdirAll(workdirs[1], 0o755); err != nil {
		return fmt.Errorf("create temporary working directory: %w", err)
	}
	for index, workdir := range workdirs {
		if err := probeEmbeddedBinary(binary, workdir, filepath.Join(tempRoot, fmt.Sprintf("probe-%d.sqlite3", index))); err != nil {
			return fmt.Errorf("working directory %q: %w", workdir, err)
		}
	}
	return nil
}

func probeEmbeddedBinary(binary, workdir, dbPath string) error {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return fmt.Errorf("reserve probe address: %w", err)
	}
	addr := listener.Addr().String()
	if err := listener.Close(); err != nil {
		return fmt.Errorf("release probe address: %w", err)
	}

	var stdout, stderr bytes.Buffer
	command := exec.Command(binary, "serve", "--addr", addr, "--public-url", "http://"+addr, "--db", dbPath, "--owner-token", "rfeed_embedded_ui_probe_owner_token_000000000000000")
	command.Dir = workdir
	command.Env = environmentWithValue(os.Environ(), "OPENROUTER_KEY", "test-openrouter-key")
	command.Stdout = &stdout
	command.Stderr = &stderr
	if err := command.Start(); err != nil {
		return fmt.Errorf("start binary: %w", err)
	}
	defer stopProbeProcess(command)

	client := &http.Client{Timeout: 2 * time.Second}
	baseURL := "http://" + addr
	var root []byte
	deadline := time.Now().Add(15 * time.Second)
	for time.Now().Before(deadline) {
		response, requestErr := client.Get(baseURL + "/")
		if requestErr == nil {
			root, requestErr = readAndClose(response)
			if requestErr == nil && response.StatusCode == http.StatusOK {
				break
			}
		}
		time.Sleep(50 * time.Millisecond)
	}
	if !strings.Contains(string(root), "_app/immutable/") {
		return fmt.Errorf("root did not serve generated UI; stdout=%q stderr=%q", stdout.String(), stderr.String())
	}

	imports := moduleImportPattern.FindAllStringSubmatch(string(root), -1)
	if len(imports) == 0 {
		return errorsForProbe("root has no generated module import", stdout.String(), stderr.String())
	}
	assetResponse, err := client.Get(baseURL + imports[0][1])
	if err != nil {
		return fmt.Errorf("request generated asset: %w", err)
	}
	asset, err := readAndClose(assetResponse)
	if err != nil {
		return fmt.Errorf("read generated asset: %w", err)
	}
	if assetResponse.StatusCode != http.StatusOK || len(asset) == 0 {
		return fmt.Errorf("generated asset status=%d bytes=%d", assetResponse.StatusCode, len(asset))
	}

	deepLink, err := client.Get(baseURL + "/source-ledger")
	if err != nil {
		return fmt.Errorf("request deep link: %w", err)
	}
	deepBody, err := readAndClose(deepLink)
	if err != nil {
		return fmt.Errorf("read deep link: %w", err)
	}
	if deepLink.StatusCode != http.StatusOK || !bytes.Equal(deepBody, root) {
		return fmt.Errorf("deep link status=%d did not return embedded index", deepLink.StatusCode)
	}
	return nil
}

func readAndClose(response *http.Response) ([]byte, error) {
	defer func() { _ = response.Body.Close() }()
	body, err := io.ReadAll(response.Body)
	if err != nil {
		return nil, err
	}
	return body, nil
}

func stopProbeProcess(command *exec.Cmd) {
	if command == nil || command.Process == nil {
		return
	}
	_ = command.Process.Signal(os.Interrupt)
	done := make(chan struct{})
	go func() {
		_ = command.Wait()
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		_ = command.Process.Kill()
		<-done
	}
}

func environmentWithValue(environment []string, key, value string) []string {
	prefix := key + "="
	result := make([]string, 0, len(environment)+1)
	for _, entry := range environment {
		if !strings.HasPrefix(entry, prefix) {
			result = append(result, entry)
		}
	}
	return append(result, prefix+value)
}

func errorsForProbe(message, stdout, stderr string) error {
	return fmt.Errorf("%s; stdout=%q stderr=%q", message, stdout, stderr)
}

var _ fs.FS = fstest.MapFS{}
