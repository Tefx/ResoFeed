package resofeed

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync/atomic"
)

var errOutboundURLBlocked = errors.New("outbound url blocked")

var forceStrictOutboundPolicyForTests atomic.Bool

var outboundHTTPClient = &http.Client{
	Transport:     newPublicOnlyHTTPTransport(),
	CheckRedirect: checkOutboundRedirect,
}

func normalizedOutboundHTTPURL(raw string) (string, error) {
	parsed, err := parseOutboundHTTPURL(raw, false)
	if err != nil {
		return "", err
	}
	return parsed.String(), nil
}

func isOutboundHTTPURL(raw string) bool {
	_, err := parseOutboundHTTPURL(raw, false)
	return err == nil
}

func isStrictOutboundHTTPURL(raw string) bool {
	_, err := parseOutboundHTTPURL(raw, true)
	return err == nil
}

func parseOutboundHTTPURL(raw string, strict bool) (*url.URL, error) {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || parsed == nil {
		if err == nil {
			err = errors.New("empty url")
		}
		return nil, fmt.Errorf("%w: parse: %v", errOutboundURLBlocked, err)
	}
	if err := validateOutboundHTTPURL(parsed, strict); err != nil {
		return nil, err
	}
	return parsed, nil
}

func validateOutboundHTTPURL(parsed *url.URL, strict bool) error {
	if parsed == nil {
		return fmt.Errorf("%w: url required", errOutboundURLBlocked)
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return fmt.Errorf("%w: unsupported scheme", errOutboundURLBlocked)
	}
	if parsed.User != nil {
		return fmt.Errorf("%w: userinfo not allowed", errOutboundURLBlocked)
	}
	return validateOutboundHTTPHost(parsed.Hostname(), strict)
}

func validateOutboundHTTPHost(host string, strict bool) error {
	host = normalizeOutboundHost(host)
	if host == "" {
		return fmt.Errorf("%w: host required", errOutboundURLBlocked)
	}
	if strings.Contains(host, "%") {
		return fmt.Errorf("%w: scoped host not allowed", errOutboundURLBlocked)
	}
	if host == "localhost" || strings.HasSuffix(host, ".localhost") {
		if !strict && allowUnsafeOutboundForTestFixtures() {
			return nil
		}
		return fmt.Errorf("%w: localhost not allowed", errOutboundURLBlocked)
	}
	if ip := parseOutboundHostIP(host); ip != nil && !isPublicOutboundIP(ip) {
		if !strict && ip.IsLoopback() && allowUnsafeOutboundForTestFixtures() {
			return nil
		}
		return fmt.Errorf("%w: non-public ip not allowed", errOutboundURLBlocked)
	}
	return nil
}

func allowUnsafeOutboundForTestFixtures() bool {
	return !forceStrictOutboundPolicyForTests.Load() && e2eFixtureBuildEnabled && os.Getenv("RESOFEED_E2E") == "1"
}

func normalizeOutboundHost(host string) string {
	return strings.TrimSuffix(strings.ToLower(strings.TrimSpace(host)), ".")
}

func parseOutboundHostIP(host string) net.IP {
	return net.ParseIP(normalizeOutboundHost(host))
}

func isPublicOutboundIP(ip net.IP) bool {
	if ip == nil {
		return false
	}
	return !ip.IsLoopback() && !ip.IsPrivate() && !ip.IsLinkLocalUnicast() && !ip.IsLinkLocalMulticast() && !ip.IsMulticast() && !ip.IsUnspecified()
}

func checkOutboundRedirect(req *http.Request, _ []*http.Request) error {
	if req == nil || req.URL == nil {
		return fmt.Errorf("redirect target: %w: url required", errOutboundURLBlocked)
	}
	if err := validateOutboundHTTPURL(req.URL, false); err != nil {
		return fmt.Errorf("redirect target: %w", err)
	}
	return nil
}

func newPublicOnlyHTTPTransport() *http.Transport {
	base := http.DefaultTransport.(*http.Transport).Clone()
	base.Proxy = nil
	base.DialContext = publicOnlyDialContext
	return base
}

func publicOnlyDialContext(ctx context.Context, network string, address string) (net.Conn, error) {
	host, port, err := net.SplitHostPort(address)
	if err != nil {
		return nil, fmt.Errorf("outbound dial: split address: %w", err)
	}
	host = normalizeOutboundHost(host)
	if err := validateOutboundHTTPHost(host, false); err != nil {
		return nil, fmt.Errorf("outbound dial: %w", err)
	}

	resolved, err := net.DefaultResolver.LookupIPAddr(ctx, host)
	if err != nil {
		return nil, fmt.Errorf("outbound dial: resolve %q: %w", host, err)
	}
	if len(resolved) == 0 {
		return nil, fmt.Errorf("outbound dial: resolve %q: no addresses", host)
	}
	for _, candidate := range resolved {
		if !isPublicOutboundIP(candidate.IP) && !(candidate.IP.IsLoopback() && allowUnsafeOutboundForTestFixtures()) {
			return nil, fmt.Errorf("outbound dial: %w: %s resolved to non-public ip %s", errOutboundURLBlocked, host, candidate.IP)
		}
	}

	dialer := net.Dialer{}
	var lastErr error
	for _, candidate := range resolved {
		ip := candidate.IP
		if !ipMatchesNetwork(network, ip) {
			continue
		}
		conn, err := dialer.DialContext(ctx, network, net.JoinHostPort(ip.String(), port))
		if err == nil {
			return conn, nil
		}
		lastErr = err
	}
	if lastErr != nil {
		return nil, fmt.Errorf("outbound dial: connect %q: %w", host, lastErr)
	}
	return nil, fmt.Errorf("outbound dial: no %s address for %q", network, host)
}

func ipMatchesNetwork(network string, ip net.IP) bool {
	switch network {
	case "tcp4":
		return ip.To4() != nil
	case "tcp6":
		return ip.To4() == nil
	default:
		return true
	}
}
