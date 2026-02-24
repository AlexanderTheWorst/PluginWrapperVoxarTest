import { defineCommand, definePlugin } from "../src/plugin/index.js";

export default definePlugin({
    commands: [
        defineCommand({
            name: "test",
            description: "sigma",
            async run(interaction) {
                let data = await interaction.send("Yahoooo");
                data.yo().then(e => console.log(e, "yooo"));
            },
        })
    ]
})