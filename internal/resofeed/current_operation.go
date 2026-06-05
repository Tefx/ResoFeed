package resofeed

import (
	"sync"
	"time"
)

const RuntimeOperationHTTPPath = "/api/runtime/operation"

const RuntimeOperationMCPResourceURI = "resofeed://system/operation"

// CurrentOperationInfo is a process-local, best-effort view of the guarded
// runtime operation. It is intentionally in-memory only and is cleared when the
// guard is released; it is not persisted or kept as a ledger.
type CurrentOperationInfo struct {
	Running   bool                   `json:"running"`
	Kind      *string                `json:"kind"`
	ActorKind *string                `json:"actor_kind"`
	Phase     *string                `json:"phase"`
	Count     *CurrentOperationCount `json:"count"`
	Message   *string                `json:"message"`
	StartedAt *time.Time             `json:"started_at"`
	UpdatedAt *time.Time             `json:"updated_at"`
}

type CurrentOperationCount struct {
	Current int `json:"current"`
	Total   int `json:"total"`
}

type CurrentOperationResponse struct {
	Operation CurrentOperationInfo `json:"operation"`
}

type currentOperationSnapshot struct {
	mu      sync.RWMutex
	current CurrentOperationInfo
}

func (s *currentOperationSnapshot) start(kind string, scope any, actorKind string) {
	canonicalKind, ok := representedOperationKind(kind, scope)
	if !ok {
		s.clear()
		return
	}
	now := time.Now().UTC()
	canonicalActorKind := canonicalOperationActorKind(actorKind)
	phase := "starting"
	message := currentOperationStartMessage(canonicalKind)
	s.mu.Lock()
	s.current = CurrentOperationInfo{
		Running:   true,
		Kind:      stringPtr(canonicalKind),
		ActorKind: stringPtr(canonicalActorKind),
		Phase:     stringPtr(phase),
		Message:   stringPtr(message),
		StartedAt: timePtr(now),
		UpdatedAt: timePtr(now),
	}
	s.mu.Unlock()
}

func (s *currentOperationSnapshot) update(phase string, count *CurrentOperationCount, message string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.current.Running {
		return
	}
	if phase != "" {
		s.current.Phase = stringPtr(phase)
	}
	if count != nil {
		countCopy := *count
		s.current.Count = &countCopy
	}
	if message != "" {
		s.current.Message = stringPtr(message)
	}
	now := time.Now().UTC()
	s.current.UpdatedAt = timePtr(now)
}

func (s *currentOperationSnapshot) clear() {
	s.mu.Lock()
	s.current = CurrentOperationInfo{}
	s.mu.Unlock()
}

func (s *currentOperationSnapshot) get() CurrentOperationInfo {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return cloneCurrentOperationInfo(s.current)
}

func cloneCurrentOperationInfo(info CurrentOperationInfo) CurrentOperationInfo {
	clone := info
	if info.Kind != nil {
		clone.Kind = stringPtr(*info.Kind)
	}
	if info.ActorKind != nil {
		clone.ActorKind = stringPtr(*info.ActorKind)
	}
	if info.Phase != nil {
		clone.Phase = stringPtr(*info.Phase)
	}
	if info.Message != nil {
		clone.Message = stringPtr(*info.Message)
	}
	if info.Count != nil {
		count := *info.Count
		clone.Count = &count
	}
	if info.StartedAt != nil {
		clone.StartedAt = timePtr(*info.StartedAt)
	}
	if info.UpdatedAt != nil {
		clone.UpdatedAt = timePtr(*info.UpdatedAt)
	}
	return clone
}

func currentOperationInfo() CurrentOperationInfo {
	return ingestGuardState.current.get()
}

func updateCurrentOperation(phase string, count *CurrentOperationCount, message string) {
	ingestGuardState.current.update(phase, count, message)
}

func representedOperationKind(kind string, scope any) (string, bool) {
	switch kind {
	case "ingest":
		if scope == "background" {
			return "background_ingest", true
		}
		return "manual_ingest", true
	case "fetch":
		return "source_fetch", true
	case "reprocess":
		return "library_reprocess", true
	case "item_reingest":
		return "item_reingest", true
	case "background_ingest", "manual_ingest", "source_fetch", "library_reprocess":
		return kind, true
	default:
		return "", false
	}
}

func canonicalOperationKind(kind string, scope any) string {
	canonical, ok := representedOperationKind(kind, scope)
	if !ok {
		return ""
	}
	return canonical
}

func canonicalOperationActorKind(actorKind string) string {
	switch actorKind {
	case "background":
		return "background"
	case string(ActorKindAgent):
		return string(ActorKindAgent)
	default:
		return string(ActorKindHuman)
	}
}

func currentOperationStartMessage(kind string) string {
	switch kind {
	case "background_ingest":
		return "background ingest starting"
	case "manual_ingest":
		return "manual ingest starting"
	case "source_fetch":
		return "manual source fetch starting"
	case "library_reprocess":
		return "library reprocess starting"
	case "item_reingest":
		return "item reingest starting"
	default:
		return "operation running"
	}
}

func stringPtr(value string) *string {
	return &value
}

func timePtr(value time.Time) *time.Time {
	return &value
}
