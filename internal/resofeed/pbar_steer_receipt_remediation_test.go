package resofeed

import (
	"context"
	"strings"
	"testing"
)

func TestPBARSourceURLSteeringReceiptNamesSourceAndNextAction(t *testing.T) {
	ctx := context.Background()
	db := newContractDB(t, ctx)

	result, err := ApplySteering(ctx, db, nil, SteerRequest{
		Command: "https://receipt.example/feed.xml",
		MutationRequestFields: MutationRequestFields{
			ActorKind:      ActorKindHuman,
			ActorID:        "owner",
			IdempotencyKey: "pbar-source-receipt",
		},
	})
	if err != nil {
		t.Fatalf("ApplySteering source URL returned error: %v", err)
	}
	message := strings.ToLower(result.Receipt.Message)
	if result.Receipt.InterpretedAs != "add_source" || !strings.Contains(message, "source added: receipt.example") || !strings.Contains(message, "visible in source ledger") || !strings.Contains(message, "background ingest will pick it up") {
		t.Fatalf("source receipt = %+v, want source identity and background-ingest orientation", result.Receipt)
	}
	forbiddenGuidance := []string{"run ingest in source ledger", "[run ingest]", "[fetch]"}
	for _, forbidden := range forbiddenGuidance {
		if strings.Contains(message, forbidden) {
			t.Fatalf("source receipt = %+v, must not contain stale guidance %q", result.Receipt, forbidden)
		}
	}
}
