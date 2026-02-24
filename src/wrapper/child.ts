import { workerData, isMainThread, parentPort } from "node:worker_threads";
import { NodeVM } from "vm2";
import type { Command, Plugin } from "../plugin/index.js";
import { createHash, randomBytes } from "node:crypto";

type ExpandedCommand = (Command & { id: string, serialize: () => Record<string, any> });

const awaiting = new Map<string, CallableFunction>();

function deserialize(serialized: Record<string, any>): any {
    function recurse(data: Record<string, any>) {
        let deserialized: Record<string, any> = {}

        for (let key in data) {
            if (Array.isArray(data[key])) {
                deserialized[key] = data[key]
            } else if (typeof data[key] == "string" || typeof data[key] == "number") {
                deserialized[key] = data[key]
            } else if (data[key] && typeof data[key] == "object") {
                if ("type" in data[key]) {
                    deserialized[key] = (...args: any) => {
                        const id = createHash("sha256").update(randomBytes(256)).digest("hex");
                        parentPort?.postMessage({
                            id,
                            target: {
                                id: data[key].id,
                                type: "method",
                            },
                            data: args
                        });

                        return new Promise((resolve, reject) => {
                            awaiting.set(id, (data: any) =>
                                resolve(deserialize(data))
                            )
                        })
                    }
                } else {
                    deserialized[key] = recurse(data[key])
                }
            }
        }

        return deserialized;
    }

    if (
        typeof serialized == "string" ||
        typeof serialized == "number" ||
        typeof serialized == "bigint" ||
        typeof serialized == "boolean" ||
        typeof serialized == "undefined" ||
        !serialized
    ) {
        return serialized
    }

    return recurse(serialized);
}

if (!isMainThread && parentPort) {
    const commands: ExpandedCommand[] = []

    let pluginVM;
    try {
        pluginVM = new NodeVM({
            require: {
                mock: {
                    "../src/plugin/index.js": Object.freeze({
                        defineCommand: function (command: Command) {
                            const id = createHash("sha256").update(randomBytes(256)).digest("hex");
                            commands.push({
                                ...command,
                                id,
                                serialize: () => {
                                    return {
                                        name: command.name,
                                        description: command.description,
                                        id,
                                    }
                                }
                            });
                        },
                        definePlugin: function (plugin: Plugin) {
                            return {
                                ...plugin,
                                commands
                            };
                        }
                    })
                }
            }
        });
    } catch (err) {
        console.log(err);
    }

    if (!pluginVM) throw parentPort.postMessage({
        id: 0,
        data: null
    });

    const pluginRuntime: Plugin & {
        commands: ExpandedCommand[]
    } = { ...pluginVM.runFile(workerData.pluginPath).default, commands };

    parentPort.on("message", (payload) => {
        if (payload.id && awaiting.has(payload.id)) {
            awaiting.get(payload.id)?.(payload.data)
            awaiting.delete(payload.id)
            return;
        }

        if (payload.target) {
            let target: Command | undefined = undefined;
            if (payload.target.type == "command")
                target = commands.find(c => c.id === payload.target.id)

            if (target) {
                if (payload.target.action == "call") {
                    target.run.call(pluginRuntime, deserialize(payload.data as Record<string, any>))
                }
            }
        }
    });

    parentPort.postMessage({
        id: 0,
        data: {
            ...pluginRuntime,
            commands: commands.map(c => c.serialize())
        }
    })
}