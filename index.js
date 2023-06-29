#!/usr/bin/env node

const fs = require("fs/promises");
const arg = require("arg");

require("inkjs/compiler/Parser/InkParser");
require("inkjs/compiler/parser/StatementLevel");

const format = require("./lib/format");
const validate = require("./lib/validate");

function doValidation(src, out, inputFilename) {
	const validation = validate(src, out, inputFilename);

	if (validation) {
		process.stdout.write(" [ Validation Error ]\n");
		const lineNumber = Number(validation.message.match(/\d+/));
		console.log(validation);
		console.log("");
		console.log(
			out
				.split("\n")
				.flatMap((line, i, { length }) => {
					const lineMarker = String(i + 1).padEnd(
						1 + Math.ceil(Math.log10(length)),
						" "
					);

					return i === lineNumber - 1
						? [
								lineMarker + line,

								new Array(1 + Math.ceil(Math.log10(length)))
									.fill(" ")
									.join("") +
									new Array(line.length).fill("^").join(""),
						  ]
						: lineMarker + line;
				})
				.slice(Math.max(0, lineNumber - 3), lineNumber + 4)
				.join("\n")
		);
	}

	return validation;
}

async function main(args) {
	if (args["--help"]) {
		return printHelp();
	}
	if (args["--verbose"]) {
		console.log({ args });
		console.log("");
	}

	for (const inputFilename of args._) {
		process.stdout.write(inputFilename);

		const src = await fs.readFile(inputFilename, "utf8");
		const out = (() => {
			try {
				return format(src, inputFilename);
			} catch (e) {
				return e;
			}
		})();

		if (doValidation(src, out, inputFilename)) {
			break;
		}

		if (typeof out === "string") {
			process.stdout.write(" [ OK ]\n");

			if (args["--write"]) {
				await fs.writeFile(inputFilename, out);
			} else {
				console.log(out);
			}
		} else {
			process.stdout.write(" [ Format Error ]\n");
			console.log(out);
			break;
		}
	}
}

const argSpec = {
	// General
	"--help": Boolean,
	"--version": Boolean,
	"--verbose": arg.COUNT, // Counts the number of times --verbose is passed

	"--sort-includes": Boolean,
	"--write": Boolean,

	// Aliases
	"-h": "--help",
	"-w": "--write",
	"-v": "--verbose",
};

function printHelp() {
	console.log(
		`
Ballpoint
A CLI for formatting .ink files

Usage:
         $ ballpoint --sort-includes --write **/*.ink

Arguments:
        --help
        --version
        --verbose

        --sort-includes  : Sort all INCLUDE statements in the file
        --write          : Overwrite the files

        / Aliases
        -h = --help
        -w = --write
        -s = --sort-includes
        -v = --verbose
`.trim(),
		"\n"
	);
}

main(arg(argSpec, { permissive: true, argv: process.argv.slice(2) }));
