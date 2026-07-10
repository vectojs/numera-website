default:
    @just --list

dev:
    @bun run dev

verify:
    @bun run format:check
    @bun run lint
    @bun run test
    @bun run build

browser-verify:
    @bun run test:e2e

deploy: verify
    @bun run deploy

