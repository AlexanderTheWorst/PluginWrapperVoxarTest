import { defineCommand, definePlugin } from "../src/plugin/index.js";

export default definePlugin({
    commands: [
        defineCommand({
            name: "test",
            description: "sigma",
            run(interaction) {
                console.log(interaction);
            },
        })
    ]
})