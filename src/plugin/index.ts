export interface Command {
    name: string;
    description: string;
    run: (this: Plugin, interaction: Interaction) => void;
}

export interface Interaction {
    id: string;
    send: (args: any) => any;
}

export interface Plugin {
    commands: Command[]
}

export function defineCommand(command: Command): Command {
    return {
        name: command.name,
        description: command.description,
        run: command.run
    }
}

export function definePlugin(options: {
    commands: Command[]
}): Plugin {
    return {
        commands: options.commands
    }
}