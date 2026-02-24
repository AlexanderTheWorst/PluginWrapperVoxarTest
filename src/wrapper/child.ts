import { workerData, isMainThread, parentPort } from "node:worker_threads";
import { NodeVM } from "vm2";
import type { Command, Plugin } from "../plugin/index.js";
import { createHash, randomBytes } from "node:crypto";

type ExpandedCommand = (Command & { id: string, serialize: () => Record<string, any> });

function deserialize(serialized: Record<string, any>): any {
    function recurse(data: Record<string, any>) {
        let deserialized: Record<string, any> = {}

        for (let key in data) {
            if (typeof data[key] == "object") {
                if ("type" in data[key]) {
                    deserialized[key] = (...args: any) => {
                        parentPort?.postMessage({
                            id: createHash("sha256").update(randomBytes(256)).digest("hex"),
                            target: {
                                id: data[key].id,
                                type: "method",
                            },
                            data: args
                        });
                    }
                } else {
                    deserialized[key] = recurse(data[key])
                }
            } else if (typeof data[key] == "string" || typeof data[key] == "number") {
                deserialized[key] = data[key]
            } else if (Array.isArray(data[key])) {
                deserialized[key] = data[key]
            }
        }

        return deserialized;
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
                    "../src/plugin/index.js": {
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
                    }
                }
            }
        });
    } catch(err) {
        console.log(err);
    }

    if (!pluginVM) throw parentPort.postMessage({
        id: 0,
        data: null
    });

    const pluginRuntime: Plugin & {
        commands: ExpandedCommand[]
    } = { ...pluginVM.runFile(workerData.pluginPath).default, commands };

    console.log(pluginRuntime);

    parentPort.on("message", (payload) => {
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