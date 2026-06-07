package resofeed

import (
	"bufio"
	"errors"
	"fmt"
	"os"
	"strings"
)

const (
	openRouterKeyEnvName = "OPENROUTER_KEY"
	tavilyKeyEnvName     = "TAVILY_API_KEY"
)

const (
	openRouterKeySourceEnv    = "env:OPENROUTER_KEY"
	openRouterKeySourceDotEnv = "cwd:.env"
	tavilyKeySourceEnv        = "env:TAVILY_API_KEY"
	tavilyKeySourceDotEnv     = "cwd:.env"
)

type OpenRouterRuntimeSecret struct {
	Value  string
	Source string
}

type TavilyRuntimeSecret struct {
	Value  string
	Source string
}

type runtimeSecret struct {
	Value  string
	Source string
}

type runtimeSecretSpec struct {
	EnvName      string
	EnvSource    string
	DotEnvSource string
	InvalidCode  string
	MissingErr   error
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

// ResolveTavilyRuntimeSecret applies the documented runtime-only Tavily secret
// precedence before source-acquisition construction: OS environment, then local
// .env fallback. It returns only the secret value and must not be logged or
// persisted.
func ResolveTavilyRuntimeSecret() (string, error) {
	secret, err := ResolveTavilyRuntimeSecretWithSource()
	if err != nil {
		return "", err
	}
	return secret.Value, nil
}

// ResolveTavilyRuntimeSecretWithSource resolves Tavily credentials with a
// non-secret source label for internal wiring. Callers must not log, render, or
// persist the source label.
func ResolveTavilyRuntimeSecretWithSource() (TavilyRuntimeSecret, error) {
	return resolveTavilyRuntimeSecretWithSource(false)
}

// ResolveTavilyRuntimeSecretOptional resolves Tavily credentials when present.
// Missing TAVILY_API_KEY in both OS environment and local .env is non-fatal and
// disables external source recovery; explicit empty/whitespace values remain
// startup-invalid so misconfiguration fails before bind.
func ResolveTavilyRuntimeSecretOptional() (TavilyRuntimeSecret, bool, error) {
	secret, err := resolveTavilyRuntimeSecretWithSource(true)
	if err != nil {
		if errors.Is(err, errTavilyKeyMissing) {
			return TavilyRuntimeSecret{}, false, nil
		}
		return TavilyRuntimeSecret{}, false, err
	}
	return secret, true, nil
}

var (
	errOpenRouterKeyMissing = errors.New("openrouter key missing")
	errTavilyKeyMissing     = errors.New("tavily key missing")
)

func resolveOpenRouterRuntimeSecretWithSource(optional bool) (OpenRouterRuntimeSecret, error) {
	secret, err := resolveRuntimeSecretWithSource(runtimeSecretSpec{
		EnvName:      openRouterKeyEnvName,
		EnvSource:    openRouterKeySourceEnv,
		DotEnvSource: openRouterKeySourceDotEnv,
		InvalidCode:  "invalid_openrouter_key",
		MissingErr:   errOpenRouterKeyMissing,
	}, optional)
	if err != nil {
		return OpenRouterRuntimeSecret{}, err
	}
	return OpenRouterRuntimeSecret{Value: secret.Value, Source: secret.Source}, nil
}

func resolveTavilyRuntimeSecretWithSource(optional bool) (TavilyRuntimeSecret, error) {
	secret, err := resolveRuntimeSecretWithSource(runtimeSecretSpec{
		EnvName:      tavilyKeyEnvName,
		EnvSource:    tavilyKeySourceEnv,
		DotEnvSource: tavilyKeySourceDotEnv,
		InvalidCode:  "invalid_tavily_key",
		MissingErr:   errTavilyKeyMissing,
	}, optional)
	if err != nil {
		return TavilyRuntimeSecret{}, err
	}
	return TavilyRuntimeSecret{Value: secret.Value, Source: secret.Source}, nil
}

func resolveRuntimeSecretWithSource(spec runtimeSecretSpec, optional bool) (runtimeSecret, error) {
	if value, ok := os.LookupEnv(spec.EnvName); ok {
		secret, err := requireRuntimeSecretValue(value, spec.InvalidCode)
		if err != nil {
			return runtimeSecret{}, err
		}
		return runtimeSecret{Value: secret, Source: spec.EnvSource}, nil
	}
	values, err := readLocalDotEnvRuntimeSecrets(".env")
	if err != nil {
		return runtimeSecret{}, err
	}
	if value, ok := values[spec.EnvName]; ok {
		secret, err := requireRuntimeSecretValue(value, spec.InvalidCode)
		if err != nil {
			return runtimeSecret{}, err
		}
		return runtimeSecret{Value: secret, Source: spec.DotEnvSource}, nil
	}
	if optional {
		return runtimeSecret{}, spec.MissingErr
	}
	return runtimeSecret{}, fmt.Errorf("%s: value required", spec.InvalidCode)
}

func requireRuntimeSecretValue(value string, invalidCode string) (string, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return "", fmt.Errorf("%s: value required", invalidCode)
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
