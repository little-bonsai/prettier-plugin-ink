const { pipe, getKind, logNode, tap, tapJSON } = require("./util");
function join(sep, xs) {
	const acc = [];
	let i = 0;
	while (i < xs.length) {
		acc.push(xs[i++]);
		if (i !== xs.length) {
			acc.push(sep);
		}
	}
	return acc;
}

function printIsolatedExpression(exp, retainIndentation = false) {
	return [
		retainIndentation ? [] : { kind: "DisableIndent" },
		{ kind: "Line", force: false },
		exp,
		{ kind: "Line", force: false },
		retainIndentation ? [] : { kind: "EnableIndent" },
	];
}

function wrapSubExpression(print, node) {
	return getKind(node).includes("Expression")
		? ["(", print(node), ")"]
		: print(node);
}

function getSibling(node, delta) {
	const myIndex = node?.parent?.content?.findIndex((x) => x === node) ?? 0;
	return node?.parent?.content?.[myIndex + delta];
}

exports.Null = function Null({ node, print }) {
	return;
};

exports.AuthorWarning = function AuthorWarning({ node, print }) {
	return ["TODO: ", node.warningMessage, { kind: "Line", force: false }];
};

exports.Array = function Array({ node, print }) {
	return node.map((child, _, content) => {
		child.parent ||= { content };
		return print(child);
	});
};

exports.Conditional = function Conditional({ node, print, context }) {
	const out = [];
	const isInline = node.content.some((child) => child.isInline);

	if (isInline) {
		out.push("{");
		if (node.initialCondition) {
			out.push(print(node.initialCondition));
			out.push(":");
		}
		out.push(print(node.branches));
		out.push("}");
	} else {
		out.push("{");
		if (node.initialCondition) {
			out.push(print(node.initialCondition));
			out.push(":");
		} else {
			context.isSwitchCase = true;
		}
		out.push({ kind: "Line", force: true });
		out.push({ kind: "Indent", fn: (x) => x + 1 });
		out.push(
			print(node.branches).map((x) => [x, { kind: "Line", force: false }])
		);
		out.push({ kind: "Indent", fn: (x) => x - 1 });
		out.push("}");
	}

	context.isSwitchCase = false;
	return out;
};

exports.ConditionalSingleBranch = function ConditionalSingleBranch({
	node,
	print,
	context,
}) {
	const out = [];

	const { isInline } = node;
	const subContext = { ...context, isInline };

	if (node.isInline) {
		if (node.isElse) {
			out.push("|");
			out.push(print(node.content, subContext));
		} else if (node.isTrueBranch) {
			out.push(print(node.content, subContext));
		}
	} else {
		let child = null;

		if (node.isElse) {
			out.push({ kind: "Indent", fn: (x) => x - 1 });
			out.push("- else: ");
			out.push({ kind: "Line", force: false });
			out.push({ kind: "Indent", fn: (x) => x + 1 });
			child = node.content;
		} else if (node.isTrueBranch) {
			child = node.content;
		} else if (node.matchingEquality || context.isSwitchCase) {
			out.push("- ");
			out.push(print(node.content[1]));
			out.push(": ");
			child = node.content[0];
		}

		if (
			node.content[0].content.length > 1 &&
			node.content[0].content[1].text !== "\n"
		) {
			out.push({ kind: "Indent", fn: (x) => x + 1 });
			out.push({ kind: "Line", force: false });
			out.push(print(child));
			out.push({ kind: "Indent", fn: (x) => x - 1 });
		} else {
			out.push(print(child));
		}
	}

	return out;
};

exports.ref = function ref({ node, print }) {
	if (node.outputWhenComplete) {
		return ["{", print(node.pathIdentifiers), "}"];
	} else {
		return join(".", print(node.pathIdentifiers));
	}
};

exports.ContentList = function ContentList({ node, print, context }) {
	return print(node.content, context);
};

exports.FunctionCall = function FunctionCall({ node, print, context }) {
	const out = [];
	const isTopLevel = node.outputWhenComplete || node.shouldPopReturnedValue;

	if (isTopLevel) {
		const isInline = node.outputWhenComplete;
		if (isInline) {
			out.push("{");
			out.push(print(node.content, { ...context, isInline }));
			out.push("}");
		} else {
			out.push("~ ");
			out.push(print(node.content, { ...context, isInline }));
		}
	} else {
		out.push(print(node.content, context));
	}

	return out;
};

exports.Text = function Text({ node, print }) {
	if (node.text === "\n") {
		return { kind: "Line", force: true };
	} else {
		return node.text;
	}
};

exports.Tag = function Tag({ node, print }) {
	if (node.isStart) {
		return "#";
	}
	return;
};

exports.MultipleConditionExpression = function MultipleConditionExpression({
	node,
	print,
}) {
	const out = [];
	for (const child of print(node.content)) {
		out.push("{ ");
		out.push(child);
		out.push(" } ");
		out.push({ kind: "Line", force: false });
	}

	return out;
};

exports.Choice = function Choice({ node, print, context }) {
	const out = [{ kind: "Line", force: false }];
	const hasSquareBrackets =
		node.choiceOnlyContent ||
		(getKind(node.innerContent?.content?.[0]) === "Text" &&
			node.innerContent?.content?.[0].text !== "\n");

	out.push({
		kind: "Indent",
		fn: (_) => node.indentationDepth,
		mayBreak: true,
		flavour: "Choice",
	});
	out.push({ kind: "DisableIndent" });
	out.push(new Array(node.indentationDepth).fill("  ").join(""));
	out.push(
		new Array(node.indentationDepth)
			.fill(node.onceOnly ? "* " : "+ ")
			.join("")
	);

	if (node.identifier) {
		out.push("(");
		out.push(print(node.identifier));
		out.push(") ");
	}

	if (node._condition) {
		if (getKind(node._condition) === "MultipleConditionExpression") {
			out.push({ kind: "EnableIndent" });
			out.push(print(node._condition));
		} else {
			const conditionPrinted = print(node._condition);
			const conditionLength = conditionPrinted
				.flat(Infinity)
				.join("").length;

			out.push("{");
			out.push(conditionPrinted);
			out.push("} ");
			if (conditionLength > 40) {
				out.push({ kind: "EnableIndent" });
				out.push({ kind: "Line", force: false });
			}
		}

		if (node.identifier) {
			out.push({ kind: "EnableIndent" });
			out.push({ kind: "Line", force: false });
		}
	}

	if (
		node.isInvisibleDefault &&
		node.innerContent?.content?.[0].text === "\n"
	) {
		out.push("->");
	}

	out.push(print(node.startContent, context));

	if (hasSquareBrackets) {
		out.push("[");
		out.push(print(node.choiceOnlyContent));
		out.push("]");
	}

	out.push(print(node.innerContent));

	out.push({ kind: "Line", force: false });
	out.push({ kind: "EnableIndent" });

	return out;
};

exports.Gather = function Gather({ node, print }) {
	const out = [];

	out.push({ kind: "Line", lines: 1 });
	out.push({
		kind: "Indent",
		fn: (_) => node.indentationDepth,
		mayBreak: true,
		flavour: "Gather",
	});

	out.push({ kind: "DisableIndent" });
	out.push(new Array(node.indentationDepth).fill("  ").join(""));
	out.push(new Array(node.indentationDepth).fill("- ").join(""));

	if (node.identifier) {
		out.push("(");
		out.push(print(node.identifier));
		out.push(") ");
	}

	out.push({ kind: "EnableIndent" });

	return out;
};

function Knot({ node, print }) {
	const out = [];
	out.push({
		kind: "Line",
		force: true,
		lines: node.isFunction ? 2 : 3,
	});
	out.push({ kind: "Indent", fn: (_) => 0 });
	out.push("=== ");
	if (node.isFunction) {
		out.push("function ");
	}
	out.push(print(node.identifier));

	if (node.args?.length > 0) {
		out.push("(");
		out.push(join(", ", print(node.args)));
		out.push(")");
	}

	if (!node.isFunction) {
		out.push(" ===");
	}
	out.push({ kind: "Line", force: false });

	out.push({ kind: "Indent", fn: (_) => (node.isFunction ? 1 : 1) });
	out.push(print(node.content));
	out.push({ kind: "Indent", fn: (_) => 0 });

	return out;
}
exports.Knot = Knot;
exports.Function = Knot;

exports.Stitch = function Stitch({ node, print }) {
	const out = [];
	out.push({ kind: "Line", force: true, lines: 2 });
	out.push({ kind: "Indent", fn: (_) => 0 });

	out.push("= ");
	out.push(print(node.identifier));

	if (node.args?.length > 0) {
		out.push("(");
		out.push(join(", ", print(node.args)));
		out.push(")");
	}

	out.push({ kind: "Line", force: false });

	out.push({ kind: "Indent", fn: (_) => 1 });
	out.push(print(node.content));
	out.push({ kind: "Indent", fn: (_) => 0 });

	return out;
};

exports.Argument = function Argument({ node, print }) {
	const out = [];
	if (node.isByReference) {
		out.push("ref");
	}

	if (node.isDivertTarget) {
		out.push("->");
	}

	out.push(print(node.identifier));

	return out.join(" ");
};

exports.Weave = function Weave({ node, print }) {
	return print(node.content);
};

exports.DivertTarget = function DivertTarget({ node, print, context }) {
	return print(node.divert, { ...context, isInline: true });
};

exports.Divert = function Divert({ node, print, context }) {
	const out = [];

	if (
		!node.isFunctionCall &&
		!node.isThread &&
		!getSibling(node, -1)?.isTunnel
	) {
		out.push("-> ");
	}

	if (!node.isFunctionCall && node.isThread) {
		out.push("<- ");
	}

	out.push(print(node.target));

	if (node.args.length > 0) {
		out.push("(");
		out.push(join(", ", print(node.args)));
		out.push(")");
	} else if (node.isFunctionCall) {
		out.push("()");
	}

	if (!node.isFunctionCall && !context.isInline && !node.isTunnel) {
		out.push({ kind: "Line", force: false });
	}

	if (node.isTunnel) {
		out.push(" -> ");
	}

	return out;
};

exports.TunnelOnwards = function TunnelOnwards({ node, print }) {
	return ["->->", { kind: "Line", force: false }];
};

exports.Sequence = function Sequence({ node, print, context }) {
	const out = [];
	out.push("{");

	const isInline = !node.sequenceElements.some(
		({ content: { length } }) => length > 1
	);

	if (isInline) {
		if (node.sequenceType === 2) {
			out.push("&");
		}
		if (node.sequenceType === 4) {
			out.push("~");
		}
		if (node.sequenceType === 8) {
			out.push("!");
		}

		out.push(join("|", print(node.sequenceElements)));
	} else {
		const validChildren = node.sequenceElements.map((child) => ({
			...child,
			content: child.content.filter(({ text }, i, { length }) => {
				if (i === 0 && text === "\n") {
					return false;
				}
				if (i === length - 1 && text === "\n") {
					return false;
				}

				return true;
			}),
		}));

		const multiLine = validChildren.length > 1;

		const { sequenceType } = node;

		const sequenceKind = [
			sequenceType & 1 ? "stopping" : null,
			sequenceType & 2 ? "cycle" : null,
			sequenceType & 4 ? "shuffle" : null,
			sequenceType & 8 ? "once" : null,
		]
			.filter(Boolean)
			.join(" ");

		out.push(sequenceKind);
		out.push(":");
		if (multiLine) {
			out.push({ kind: "Line", force: true });
		}
		out.push({ kind: "Indent", fn: (x) => x + 1 });

		out.push(
			join(
				{ kind: "Line", force: true },
				print(validChildren, {
					...context,
					isInline: !multiLine,
				}).map((x) => (multiLine ? ["- ", x] : x))
			)
		);

		out.push({ kind: "Indent", fn: (x) => x - 1 });

		if (multiLine) {
			out.push({ kind: "Line", force: true });
		}
	}

	out.push("}");

	return out;
};

exports.Path = function Path({ node, print, context }) {
	const path = [...print(node.components, context)];
	return path.join(".");
};

exports.Identifier = function Identifier({ node, print }) {
	return node.name;
};

exports.Number = function Number({ node, print }) {
	return node.value + "";
};

exports.Glue = function Glue({ node, print }) {
	return "<>";
};

exports.ListDefinition = function ListDefinition({ node, print }) {
	return join(", ", print(node.itemDefinitions));
};

exports.ListElement = function ListElement({ node, print }) {
	const out = [];

	if (node.inInitialList) {
		out.push("(");
		out.push(print(node.indentifier));
		out.push(")");
	} else {
		out.push(print(node.indentifier));
	}

	if (node.explicitValue) {
		out.push(" = ");
		out.push(node.explicitValue + "");
	}

	return out;
};

exports.IncDecExpression = function IncDecExpression({ node, print }) {
	return [
		{ kind: "Line", force: false },
		"~ ",
		print(node.varIdentifier),
		node.expression
			? [node.isInc ? " += " : " -= ", print(node.expression)]
			: node.isInc
			? "++"
			: "--",
		{ kind: "Line", force: false },
	];
};

exports.String = function String({ node, print }) {
	return ['"', print(node.content), '"'];
};

exports.UnaryExpression = function UnaryExpression({ node, print }) {
	return [
		node.opName || node.op,
		" ",
		wrapSubExpression(print, node.innerExpression),
	];
};
exports.BinaryExpression = function BinaryExpression({ node, print }) {
	return [
		wrapSubExpression(print, node.leftExpression),
		" ",
		node.opName || node.op,
		" ",
		wrapSubExpression(print, node.rightExpression),
	];
};

exports.List = function List({ node, print }) {
	return ["(", join(", ", print(node.itemIdentifierList ?? [])), ")"];
};

exports.LIST = function LIST({ node, print }) {
	return printIsolatedExpression([
		"LIST ",
		print(node.variableIdentifier),
		" = ",
		print(node.listDefinition),
		getKind(getSibling(node, +1)) !== "LIST"
			? { kind: "Line", force: true, lines: 2 }
			: [],
	]);
};

exports.CONST = function CONST({ node, print }) {
	return printIsolatedExpression([
		"CONST ",
		print(node.constantIdentifier),
		" = ",
		print(node.expression),
		getKind(getSibling(node, +1)) !== "CONST"
			? { kind: "Line", force: true, lines: 2 }
			: [],
	]);
};

exports.VAR = function VAR({ node, print }) {
	return printIsolatedExpression([
		"VAR ",
		print(node.variableIdentifier),
		" = ",
		print(node.expression),
		getKind(getSibling(node, +1)) !== "VAR"
			? { kind: "Line", force: true, lines: 2 }
			: [],
	]);
};

exports.EXTERNAL = function EXTERNAL({ node, print }) {
	return printIsolatedExpression([
		"EXTERNAL ",
		print(node.identifier),
		"(",
		node.argumentNames.join(", "),
		")",
		getKind(getSibling(node, +1)) !== "EXTERNAL"
			? { kind: "Line", force: true, lines: 2 }
			: [],
	]);
};

exports.temp = function temp({ node, print }) {
	return printIsolatedExpression(
		[
			"~ temp ",
			print(node.variableIdentifier),
			" = ",
			print(node.expression),
		],
		true
	);
};

exports["variable assignment"] = function variableAssignment({ node, print }) {
	return printIsolatedExpression(
		[
			"~ ",
			print(node.variableIdentifier),
			" = ",
			print(node.expression),
			{ kind: "Line", force: false },
		],
		true
	);
};

exports.IncludedFile = function IncludedFile({ node, print }) {
	return print(node.includedStory);
};

exports.Story = function Story({ node, print }) {
	return printIsolatedExpression([
		`INCLUDE ${node.content[0].content[0]._debugMetadata.fileName}`,
	]);
};

exports.ReturnType = function ReturnType({ node, print }) {
	return [
		"~ return ",
		print(node.returnedExpression),
		{ kind: "Line", force: false },
	];
};