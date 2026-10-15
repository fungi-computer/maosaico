// @vitest-environment node

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { DOMAttributes } from "react";
import ts from "typescript";
import { beforeAll, expect, expectTypeOf, it } from "vitest";
import {
  useMaosaicoItem,
  useMaosaicoLayout,
  type Frame,
  type MaosaicoItemBinding,
  type SnapSide,
} from "../src/index.js";

let runtimeExports: string[] = [];
let declarationExports: string[] = [];

// Gate contention stretched this one-time built-entrypoint and TypeScript
// program setup to 7.9s; allow 20s here without widening assertion timeouts.
beforeAll(() => {
  const runtimeOutput = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      "import * as root from '@fungi.computer/maosaico'; console.log(Object.keys(root).sort().join(','));",
    ],
    {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      encoding: "utf8",
      timeout: 15_000,
    },
  );
  const options: ts.CompilerOptions = {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    target: ts.ScriptTarget.ES2022,
    strict: true,
    skipLibCheck: false,
    types: ["node", "react"],
  };
  const resolved = ts.resolveModuleName(
    "@fungi.computer/maosaico",
    fileURLToPath(import.meta.url),
    options,
    ts.sys,
  ).resolvedModule;
  if (!resolved) throw new Error("Maosaico public declarations were not built");
  const program = ts.createProgram([resolved.resolvedFileName], options);
  expect(ts.getPreEmitDiagnostics(program)).toEqual([]);
  const source = program.getSourceFile(resolved.resolvedFileName);
  if (!source) throw new Error("Maosaico public declarations were not loaded");
  if (!source.isDeclarationFile)
    throw new Error(
      "Maosaico public entrypoint did not resolve to declarations",
    );
  const checker = program.getTypeChecker();
  const symbol = checker.getSymbolAtLocation(source);
  if (!symbol) throw new Error("Maosaico public module has no export symbol");
  runtimeExports = runtimeOutput.trim().split(",");
  declarationExports = checker
    .getExportsOfModule(symbol)
    .map((entry) => entry.name);
}, 20_000);

it("keeps the state representation out of the built public entrypoint", () => {
  expect(runtimeExports).toEqual([
    "MaosaicoLayers",
    "MaosaicoRegion",
    "MaosaicoRoot",
    "applyBentoOps",
    "arrangeBento",
    "bentoFrames",
    "useLayer",
    "useMaosaicoBento",
    "useMaosaicoItem",
    "useMaosaicoLayout",
    "usePointerDrag",
  ]);
  expect(declarationExports).toContain("MaosaicoRoot");
  for (const internal of ["State", "MaosaicoState", "createMaosaicoState"])
    expect(declarationExports).not.toContain(internal);
});

it("exposes hook commands and projections without state collections", () => {
  type Layout = ReturnType<typeof useMaosaicoLayout>;
  expectTypeOf<
    ReturnType<typeof useMaosaicoItem>
  >().toEqualTypeOf<MaosaicoItemBinding>();
  expectTypeOf<MaosaicoItemBinding["props"]>().toEqualTypeOf<
    DOMAttributes<HTMLElement>
  >();
  expectTypeOf<Layout["focus"]>().toEqualTypeOf<(id: string) => void>();
  expectTypeOf<Layout["swap"]>().toEqualTypeOf<
    (first: string, second: string) => void
  >();
  expectTypeOf<Layout["snapPreview"]>().toEqualTypeOf<{
    side: SnapSide;
    frame: Frame;
  } | null>();
  expectTypeOf<
    Extract<
      keyof Layout | keyof MaosaicoItemBinding,
      "state" | "frames" | "minima" | "participating" | "gesture" | "store"
    >
  >().toEqualTypeOf<never>();
});
