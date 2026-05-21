package resofeed

import (
	"bufio"
	"errors"
	"fmt"
	"os"
	"strings"
)

const openRouterKeyEnvName = "OPENROUTER_KEY"

const (
	openRouterKeySourceEnv    = "env:OPENROUTER_KEY"
	openRouterKeySourceDotEnv = "cwd:.env"
)

type OpenRouterRuntimeSecret struct {
	Value  string
	Source string
}

// ResolveOpenRouterRuntimeSecret applies the documented runtime-only OpenRouter
// secret precedence before provider construction: OS environment, then local
// .env fallback. It never logs source metadata or returns it for persistence.
func ResolveOpenRouterRuntimeSecret() (string, error) {
	secret, err := ResolveOpenRouterRuntimeSecretWithSource()
	if err != nil {
		return "", err
	}
	return secret.Value, nil
}

// ResolveOpenRouterRuntimeSecretWithSource resolves the OpenRouter secret and a
// safe source label for startup diagnostics. The label never contains the secret
// value and must not be persisted.
func ResolveOpenRouterRuntimeSecretWithSource() (OpenRouterRuntimeSecret, error) {
	return resolveOpenRouterRuntimeSecretWithSource(false)
}

// ResolveOpenRouterRuntimeSecretOptional resolves OpenRouter credentials when
// present. A missing OPENROUTER_KEY in both OS environment and local .env is a
// provider-unavailable state, not a whole-runtime startup failure. Present but
// empty values remain invalid so local misconfiguration is still explicit.
func ResolveOpenRouterRuntimeSecretOptional() (OpenRouterRuntimeSecret, bool, error) {
	secret, err := resolveOpenRouterRuntimeSecretWithSource(true)
	if err != nil {
		if errors.Is(err, errOpenRouterKeyMissing) {
			return OpenRouterRuntimeSecret{}, false, nil
		}
		return OpenRouterRuntimeSecret{}, false, err
	}
	return secret, true, nil
}

var errOpenRouterKeyMissing = errors.New("openrouter key missing")

func resolveOpenRouterRuntimeSecretWithSource(optional bool) (OpenRouterRuntimeSecret, error) {
	if value, ok := os.LookupEnv(openRouterKeyEnvName); ok {
		secret, err := requireRuntimeSecretValue(value)
		if err != nil {
			return OpenRouterRuntimeSecret{}, err
		}
		return OpenRouterRuntimeSecret{Value: secret, Source: openRouterKeySourceEnv}, nil
	}
	values, err := readLocalDotEnvRuntimeSecrets(".env")
	if err != nil {
		return OpenRouterRuntimeSecret{}, err
	}
	if value, ok := values[openRouterKeyEnvName]; ok {
		secret, err := requireRuntimeSecretValue(value)
		if err != nil {
			return OpenRouterRuntimeSecret{}, err
		}
		return OpenRouterRuntimeSecret{Value: secret, Source: openRouterKeySourceDotEnv}, nil
	}
	if optional {
		return OpenRouterRuntimeSecret{}, errOpenRouterKeyMissing
	}
	return OpenRouterRuntimeSecret{}, errors.New("invalid_openrouter_key: value required")
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
