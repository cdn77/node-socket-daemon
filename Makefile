.PHONY: default
default: build

cleanall: clean
	rm -rf node_modules

clean:
	rm -rf dist

node_modules:
	npm ci

dist: node_modules
	node_modules/.bin/tsc
	chmod +x dist/cli/cli.js

build: clean dist

example: dist
	@mkdir -p examples/tmp
	@echo ""
	@echo "Example server starting."
	@echo "Run 'tail -f examples/app.log' in another terminal to watch live worker output."
	@echo "Examine 'examples/tmp' to see the worker sockets and symlinks."
	@echo ""
	@sleep 2
	dist/cli/cli.js daemon --dev-server
