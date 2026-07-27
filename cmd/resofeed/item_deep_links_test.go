package main

import (
	"bytes"
	"strings"
	"testing"

	app "resofeed/internal/resofeed"
)

func TestServeRejectsInvalidDeepLinkOriginsBeforeStartup(t *testing.T) {
	for _, test := range []struct {
		name string
		args []string
		code string
	}{
		{name: "derived public URL from excluded bind address", args: []string{"serve", "--addr", "*:8080"}, code: "invalid_addr"},
		{name: "credential-bearing explicit public URL", args: []string{"serve", "--public-url", "https://owner:secret@example.test"}, code: "invalid_public_url"},
		{name: "noncanonical numeric host", args: []string{"serve", "--public-url", "https://01.2.3.4"}, code: "invalid_public_url"},
	} {
		t.Run(test.name, func(t *testing.T) {
			var stdout bytes.Buffer
			var stderr bytes.Buffer
			if exitCode := app.Main(test.args, &stdout, &stderr); exitCode != 2 {
				t.Fatalf("Main(%v) exit=%d stdout=%q stderr=%q", test.args, exitCode, stdout.String(), stderr.String())
			}
			if !strings.Contains(stderr.String(), test.code) {
				t.Fatalf("Main(%v) stderr=%q; want %q", test.args, stderr.String(), test.code)
			}
			if strings.Contains(stdout.String(), "listening") {
				t.Fatalf("Main(%v) reached listener startup: %q", test.args, stdout.String())
			}
		})
	}
}
