package resofeed

import (
	"bufio"
	"errors"
	"fmt"
	"os"
	"strings"
)

const openRouterKeyEnvName = "OPENROUTER_KEY"

// ResolveOpenRouterRuntimeSecret applies the documented runtime-only OpenRouter
// secret precedence before provider construction: OS environment, then local
// .env fallback. It never logs or returns source metadata for persistence.
func ResolveOpenRouterRuntimeSecret() (string, error) {
	if value, ok := os.LookupEnv(openRouterKeyEnvName); ok {
		return requireRuntimeSecretValue(value)
	}
	values, err := readLocalDotEnvRuntimeSecrets(".env")
	if err != nil {
		return "", err
	}
	if value, ok := values[openRouterKeyEnvName]; ok {
		return requireRuntimeSecretValue(value)
	}
	return "", errors.New("invalid_openrouter_key: value required")
}

func requireRuntimeSecretValue(value string) (string, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return "", errors.New("invalid_openrouter_key: value required")
	}
	return trimmed, nil
}

func readLocalDotEnvRuntimeSecrets(path string) (map[string]string, error) {
	file, err := os.Open(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return map[string]string{}, nil
		}
		return nil, errors.New("invalid_dotenv: cannot read local runtime secrets")
	}
	defer func() { _ = file.Close() }()

	values := make(map[string]string)
	scanner := bufio.NewScanner(file)
	lineNumber := 0
	for scanner.Scan() {
		lineNumber++
		line := scanner.Text()
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}
		key, value, ok := strings.Cut(line, "=")
		if !ok {
			return nil, fmt.Errorf("invalid_dotenv: expected KEY=VALUE on line %d", lineNumber)
		}
		key = strings.TrimSpace(key)
		if key == "" || strings.ContainsAny(key, " \t") {
			continue
		}
		values[key] = value
	}
	if err := scanner.Err(); err != nil {
		return nil, errors.New("invalid_dotenv: cannot read local runtime secrets")
	}
	return values, nil
}
