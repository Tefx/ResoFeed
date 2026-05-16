package resofeed

import (
	"sync"
	"time"
)

const RuntimeOperationHTTPPath = "/api/runtime/operation"

// CurrentOperationInfo is a process-local, best-effort view of the guarded
// runtime operation. It is intentionally in-memory only and is cleared when the
// guard is released; it is not a job, queue, ledger, or durable history.
type CurrentOperationInfo struct {
	Running   bool                   `json:"running"`
	Kind      *string                `json:"kind"`
	Scope     any                    `json:"scope"`
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

func (s *currentOperationSnapshot) start(kind string, scope any) {
	now := time.Now().UTC()
	phase := "starting"
	message := "operation running"
	s.mu.Lock()
	s.current = CurrentOperationInfo{
		Running:   true,
		Kind:      stringPtr(kind),
		Scope:     scope,
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

func stringPtr(value string) *string {
	return &value
}

func timePtr(value time.Time) *time.Time {
	return &value
}
