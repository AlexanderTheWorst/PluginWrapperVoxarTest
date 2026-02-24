import { defineCommand, definePlugin } from "../src/plugin/index.js";

while (true) {
    console.log("yoo")
}

export default definePlugin({
    commands: [
        defineCommand({
            name: "test",
            description: "sigma",
            subcommands: [
                defineCommand({
                    name: "sigma",
                    description: "yoo",
                    run(interaction) {
                        interaction.send("Yahoooo");
                    },
                })
            ],
            run(interaction) {
                console.log(interaction);
                interaction.send("Yahoooo");
            },
        })
    ]
})