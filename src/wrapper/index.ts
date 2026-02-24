import path from "node:path";
import { parentPort, Worker } from "node:worker_threads";
import type { Interaction, Plugin } from "../plugin/index.js";

import "./child.js";
import { createHash, randomBytes } from "node:crypto";

function serialize(data: Record<string, any>) {
    let functions: Record<string, CallableFunction> = {};

    function recurse(data: Record<string, any>) {
        let cloned: Record<string, any> = {}
        for (let key in data) {
            if (typeof data[key] == "object") {
                cloned[key] = recurse(data[key]);
            } else if (typeof data[key] == "string" || typeof data[key] == "number") {
                cloned[key] = data[key]
            } else if (data[key] && typeof data[key] == "function") {
                const id = createHash("sha256").update(randomBytes(256)).digest("hex");
                cloned[key] = {
                    type: "method",
                    id
                };
                functions[id] = data[key]
            }
        }
        return cloned;
    }

    if (
        typeof data == "string" ||
        typeof data == "number" ||
        typeof data == "bigint" ||
        typeof data == "boolean" ||
        typeof data == "undefined" ||
        !data
    ) {
        return { cloned: data, functions: {} }
    }

    return { cloned: recurse(data), functions };
}

export function wrap(pluginPath: string): Promise<Plugin | null> {
    let worker = new Worker(path.join(process.cwd(), "dist", "src-dist", "wrapper", "child.js"), {
        workerData: {
            pluginPath
        }
    });

    let mappedFunctions: Record<string, CallableFunction> = {};

    return new Promise((resolve, reject) => {
        let timeout = setTimeout(() => {
            worker.terminate();
            worker.unref();
            reject(new Error("Timed out!"))
        }, 5000)

        worker.on("message", (payload) => {
            if (payload.id == 0) {
                clearTimeout(timeout);
                resolve({
                    ...payload.data,
                    commands: payload.data.commands.map((c: any) => ({
                        name: c.name,
                        description: c.description,
                        run(interaction: Interaction) {
                            let { cloned, functions } = serialize(interaction);

                            mappedFunctions = {
                                ...mappedFunctions,
                                ...functions
                            }

                            worker?.postMessage({
                                id: createHash("sha256").update(randomBytes(256)).digest("hex"), // Action id
                                target: {
                                    id: c.id,        // This is used to do a quick lookup of the command
                                    type: "command", // We say we want to access a command
                                    action: "call"   // Call the command
                                },
                                // Arguments
                                data: cloned
                            })
                        }
                    }))
                })
            } else {
                if ("target" in payload) {
                    let target: CallableFunction | undefined;
                    if (payload.target.type == "method") {
                        target = mappedFunctions[payload.target.id];
                    }
                    if (!target) return;

                    console.log("I was ran!")

                    new Promise(async (resolve, reject) =>
                        resolve(await target?.(payload.data))
                    ).then((result: any) => {
                        console.log(typeof result)
                        const { cloned, functions } = serialize(result)
                        mappedFunctions = {
                            ...mappedFunctions,
                            ...functions
                        }
                        worker.postMessage({
                            id: payload.id,
                            data: cloned
                        })
                    })
                }
            }
        })

        return {} as any;
    })
}