import path from "node:path";
import { parentPort, Worker } from "node:worker_threads";
import type { Interaction, Plugin } from "../plugin/index.js";

import "./child.js";
import { createHash, randomBytes } from "node:crypto";

function serialize(data: Record<string, any>) {
    let functions: Record<string, any> = {};

    function recurse(data: Record<string, any>) {
        let cloned: Record<string, any> = {}
        for (let key in data) {
            if (typeof data[key] == "function") {
                const id = createHash("sha256").update(randomBytes(256)).digest("hex");
                cloned[key] = {
                    type: "method",
                    id
                };
                functions[id] = data[key]
            } else if (typeof data[key] == "object") {
                cloned[key] = recurse(data[key]);
            } else if (typeof data[key] == "string" || typeof data[key] == "number") {
                cloned[key] = data[key]
            }
        }
        return cloned;
    }

    return recurse(data);
}

export function wrap(pluginPath: string): Promise<Plugin | null> {
    const worker = new Worker(path.join(process.cwd(), "dist", "src-dist", "wrapper", "child.js"), {
        workerData: {
            pluginPath
        }
    });

    return new Promise((resolve, reject) => {
        worker.on("message", (payload) => {
            if (payload.id == 0) {
                resolve({
                    ...payload.data,
                    commands: payload.data.commands.map((c: any) => ({
                        name: c.name,
                        description: c.description,
                        run(interaction: Interaction) {
                            worker?.postMessage({
                                id: createHash("sha256").update(randomBytes(256)).digest("hex"), // Action id
                                target: {
                                    id: c.id,        // This is used to do a quick lookup of the command
                                    type: "command", // We say we want to access a command
                                    action: "call"   // Call the command
                                },
                                // Arguments
                                data: serialize(interaction)
                            })
                        }
                    }))
                })
            }
        })

        return {} as any;
    })
}