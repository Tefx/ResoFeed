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
	if result.Receipt.InterpretedAs != "add_source" || !strings.Contains(message, "source added: receipt.example") || !strings.Contains(message, "run ingest in source ledger") {
		t.Fatalf("source receipt = %+v, want source identity and Source Ledger ingest hint", result.Receipt)
	}
}
