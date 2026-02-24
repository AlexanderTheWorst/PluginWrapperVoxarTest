import path from "node:path";
import { wrap } from "./wrapper/index.js";

try {
    const wrapped = await wrap(path.join(process.cwd(), "dist", "test-dist", "test", "plugin.js"));

    wrapped?.commands[0]?.run.call(wrapped, {
        id: "123",

        send(any) {
            console.log("yooo", any)
        }
    });
} catch (err) {
    console.log(err);
}