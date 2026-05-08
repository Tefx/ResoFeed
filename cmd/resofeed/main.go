package main

import (
	"os"

	"resofeed/internal/resofeed"
)

// main is the single binary entry point. The only runtime command defined by
// the architecture is `resofeed serve`; there are no migrate, worker, doctor,
// admin, or sync sidecar processes.
func main() {
	os.Exit(resofeed.Main(os.Args[1:], os.Stdout, os.Stderr))
}
