import { workerData, isMainThread, parentPort } from "node:worker_threads";
import { NodeVM } from "vm2";
import type { Command, Plugin } from "../plugin/index.js";
import { createHash, randomBytes } from "node:crypto";

type ExpandedCommand = (Command & { id: string, serialize: () => Record<string, any> });

if (!isMainThread && parentPort) {
    const commands: ExpandedCommand[] = []

    const pluginVM = new NodeVM({
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
    })

    const pluginRuntime: Plugin & {
        commands: ExpandedCommand[]
    } = { ...pluginVM.runFile(workerData.pluginPath).default, commands };

    parentPort.on("message", (payload) => {
        if (payload.target) {
            let target: Command | undefined = undefined;
            if (payload.target.type == "command")
                target = commands.find(c => c.id === payload.target.id)

            if (target) {
                if (payload.target.action == "call") {
                    target.run.call(pluginRuntime, payload.data)
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