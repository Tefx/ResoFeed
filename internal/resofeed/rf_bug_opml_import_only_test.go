package resofeed

import (
	"go/ast"
	"go/parser"
	"go/token"
	"io/fs"
	"strings"
	"testing"
)

func TestRFBUG004GoOPMLExportSymbolAbsence(t *testing.T) {
	packages, err := parser.ParseDir(token.NewFileSet(), ".", func(info fs.FileInfo) bool {
		return !strings.HasSuffix(info.Name(), "_test.go")
	}, 0)
	if err != nil {
		t.Fatalf("parse resofeed package: %v", err)
	}
	pkg, ok := packages["resofeed"]
	if !ok {
		t.Fatal("parsed package resofeed missing")
	}

	foundImport := false
	var forbidden []string
	for _, file := range pkg.Files {
		ast.Inspect(file, func(node ast.Node) bool {
			ident, ok := node.(*ast.Ident)
			if !ok {
				return true
			}
			if ident.Name == "ImportOPML" {
				foundImport = true
			}
			if ident.Name == "ExportOPML" || strings.HasPrefix(ident.Name, "opmlExport") {
				forbidden = append(forbidden, ident.Name)
			}
			return true
		})
	}
	if !foundImport {
		t.Error("ImportOPML source-intake symbol missing")
	}
	if len(forbidden) > 0 {
		t.Fatalf("residual Go OPML export symbols: %v", forbidden)
	}
	t.Log("RF_BUG_004_GO_OPML_EXPORT_SYMBOLS=absent")
}
