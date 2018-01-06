import core from './core';
import {Character, Conversation, userStatuses} from './interfaces';
import l from './localize';
import ChannelConversation = Conversation.ChannelConversation;
import PrivateConversation = Conversation.PrivateConversation;

export const enum ParamType {
    String, Number, Character, Enum
}

const defaultDelimiters: {[key: number]: string | undefined} = {[ParamType.Character]: ',', [ParamType.String]: ''};

export function isCommand(this: void, text: string): boolean {
    return text.charAt(0) === '/' && text.substr(1, 2) !== 'me' && text.substr(1, 4) !== 'warn';
}

export function parse(this: void | never, input: string, context: CommandContext): ((this: Conversation) => void) | string {
    const commandEnd = input.indexOf(' ');
    const name = input.substring(1, commandEnd !== -1 ? commandEnd : undefined);
    const command = commands[name];
    if(command === undefined) return l('commands.unknown');
    const args = `${commandEnd !== -1 ? input.substr(commandEnd + 1) : ''}`;
    if(command.context !== undefined && (command.context & context) === 0) return l('commands.badContext');

    let index = 0;
    const values: (string | number)[] = [];

    if(command.params !== undefined)
        for(let i = 0; i < command.params.length; ++i) {
            while(args[index] === ' ') ++index;
            const param = command.params[i];
            if(index === -1)
                if(param.optional !== undefined) continue;
                else return l('commands.tooFewParams');
            let delimiter = param.delimiter !== undefined ? param.delimiter : defaultDelimiters[param.type];
            if(delimiter === undefined) delimiter = ' ';
            const endIndex = delimiter.length > 0 ? args.indexOf(delimiter, index) : args.length;
            const value = args.substring(index, endIndex !== -1 ? endIndex : undefined);
            if(value.length === 0)
                if(param.optional !== undefined) continue;
                else return l('commands.tooFewParams');
            values[i] = value;
            switch(param.type) {
                case ParamType.String:
                    if(i === command.params.length - 1) values[i] = args.substr(index);
                    break;
                case ParamType.Enum:
                    if((param.options !== undefined ? param.options : []).indexOf(value) === -1)
                        return l('commands.invalidParam', l(`commands.${name}.param${i}`));
                    break;
                case ParamType.Number:
                    const num = parseInt(value, 10);
                    if(isNaN(num))
                        return l('commands.invalidParam', l(`commands.${name}.param${i}`));
                    values[i] = num;
                    break;
                case ParamType.Character:
                    if(value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') {
                        values[i] = value.substring(1, value.length - 1);
                        break;
                    }
                    const char = core.characters.get(value);
                    if(char.status === 'offline') return l('commands.invalidCharacter');
            }
            index = endIndex === -1 ? args.length : endIndex + 1;
        }
    if(command.context !== undefined)
        return function(this: Conversation): void {
            command.exec(this, ...values);
        };
    else return () => command.exec(...values);
}

export const enum CommandContext {
    Console = 1 << 0,
    Channel = 1 << 1,
    Private = 1 << 2
}

export enum Permission {
    RoomOp = -1,
    RoomOwner = -2,
    ChannelMod = 4,
    ChatOp = 2,
    Admin = 1
}

export interface Command {
    readonly context?: CommandContext,                          //default implicit Console | Channel | Private
    readonly permission?: Permission
    readonly documented?: false,                                //default true
    readonly params?: {
        readonly type: ParamType
        readonly options?: ReadonlyArray<string>,               //default undefined
        readonly optional?: true,                               //default false
        readonly delimiter?: string,                            //default ' ' (',' for type: Character)
        validator?(data: string | number): boolean              //default undefined
    }[]
    exec(context?: Conversation | string | number, ...params: (string | number | undefined)[]): void
}

const commands: {readonly [key: string]: Command | undefined} = {
    me: {
        exec: () => 'stub',
        context: CommandContext.Channel | CommandContext.Private,
        params: [{type: ParamType.String}]
    },
    reward: {
        exec: (character: string) => core.connection.send('RWD', {character}),
        permission: Permission.Admin,
        params: [{type: ParamType.Character}]
    },
    greports: {
        permission: Permission.ChannelMod,
        exec: () => core.connection.send('PCR')
    },
    join: {
        exec: (channel: string) => core.connection.send('JCH', {channel}),
        params: [{type: ParamType.String}]
    },
    close: {
        exec: (conv: PrivateConversation | ChannelConversation) => conv.close(),
        context: CommandContext.Private | CommandContext.Channel
    },
    priv: {
        exec: (character: string) => core.conversations.getPrivate(core.characters.get(character)).show(),
        params: [{type: ParamType.Character}]
    },
    uptime: {
        exec: () => core.connection.send('UPT')
    },
    status: {
        //tslint:disable-next-line:no-inferrable-types
        exec: (status: Character.Status, statusmsg: string = '') => core.connection.send('STA', {status, statusmsg}),
        params: [{type: ParamType.Enum, options: userStatuses}, {type: ParamType.String, optional: true}]
    },
    ad: {
        exec: (conv: ChannelConversation, message: string) =>
            core.connection.send('LRP', {channel: conv.channel.id, message}),
        context: CommandContext.Channel,
        params: [{type: ParamType.String}]
    },
    roll: {
        exec: (conv: ChannelConversation | PrivateConversation, dice: string) => {
            if(Conversation.isChannel(conv)) core.connection.send('RLL', {channel: conv.channel.id, dice});
            else core.connection.send('RLL', {recipient: conv.character.name, dice});
        },
        context: CommandContext.Channel | CommandContext.Private,
        params: [{type: ParamType.String}]
    },
    bottle: {
        exec: (conv: ChannelConversation | PrivateConversation) => {
            if(Conversation.isChannel(conv)) core.connection.send('RLL', {channel: conv.channel.id, dice: 'bottle'});
            else core.connection.send('RLL', {recipient: conv.character.name, dice: 'bottle'});
        },
        context: CommandContext.Channel | CommandContext.Private
    },
    warn: {
        exec: () => 'stub',
        permission: Permission.RoomOp,
        context: CommandContext.Channel,
        params: [{type: ParamType.String}]
    },
    kick: {
        exec: (conv: ChannelConversation, character: string) =>
            core.connection.send('CKU', {channel: conv.channel.id, character}),
        permission: Permission.RoomOp,
        context: CommandContext.Channel,
        params: [{type: ParamType.Character}]
    },
    ban: {
        exec: (conv: ChannelConversation, character: string) =>
            core.connection.send('CBU', {channel: conv.channel.id, character}),
        permission: Permission.RoomOp,
        context: CommandContext.Channel,
        params: [{type: ParamType.Character}]
    },
    unban: {
        exec: (conv: ChannelConversation, character: string) =>
            core.connection.send('CUB', {channel: conv.channel.id, character}),
        permission: Permission.RoomOp,
        context: CommandContext.Channel,
        params: [{type: ParamType.Character}]
    },
    banlist: {
        exec: (conv: ChannelConversation) => core.connection.send('CBL', {channel: conv.channel.id}),
        permission: Permission.RoomOp,
        context: CommandContext.Channel
    },
    timeout: {
        exec: (conv: ChannelConversation, character: string, length: number) =>
            core.connection.send('CTU', {channel: conv.channel.id, character, length}),
        permission: Permission.RoomOp,
        context: CommandContext.Channel,
        params: [{type: ParamType.Character, delimiter: ','}, {type: ParamType.Number, validator: (x) => x >= 1}]
    },
    gkick: {
        exec: (character: string) => core.connection.send('KIK', {character}),
        permission: Permission.ChatOp,
        params: [{type: ParamType.Character}]
    },
    gban: {
        exec: (character: string) => core.connection.send('ACB', {character}),
        permission: Permission.ChatOp,
        params: [{type: ParamType.Character}]
    },
    gunban: {
        exec: (character: string) => core.connection.send('UNB', {character}),
        permission: Permission.ChatOp,
        params: [{type: ParamType.Character}]
    },
    gtimeout: {
        exec: (character: string, time: number, reason: string) =>
            core.connection.send('TMO', {character, time, reason}),
        permission: Permission.ChatOp,
        params: [{type: ParamType.Character, delimiter: ','}, {type: ParamType.Number, validator: (x) => x >= 1}, {type: ParamType.String}]
    },
    setowner: {
        exec: (conv: ChannelConversation, character: string) =>
            core.connection.send('CSO', {channel: conv.channel.id, character}),
        permission: Permission.RoomOwner,
        context: CommandContext.Channel,
        params: [{type: ParamType.Character}]
    },
    ignore: {
        exec: (character: string) => core.connection.send('IGN', {action: 'add', character}),
        params: [{type: ParamType.Character}]
    },
    unignore: {
        exec: (character: string) => core.connection.send('IGN', {action: 'delete', character}),
        params: [{type: ParamType.Character}]
    },
    ignorelist: {
        exec: () => core.conversations.selectedConversation.infoText = l('chat.ignoreList', core.characters.ignoreList.join(', '))
    },
    makeroom: {
        exec: (channel: string) => core.connection.send('CCR', {channel}),
        params: [{type: ParamType.String}]
    },
    gop: {
        exec: (character: string) => core.connection.send('AOP', {character}),
        permission: Permission.Admin,
        params: [{type: ParamType.Character}]
    },
    gdeop: {
        exec: (character: string) => core.connection.send('DOP', {character}),
        permission: Permission.Admin,
        params: [{type: ParamType.Character}]
    },
    op: {
        exec: (conv: ChannelConversation, character: string) =>
            core.connection.send('COA', {channel: conv.channel.id, character}),
        permission: Permission.RoomOwner,
        context: CommandContext.Channel,
        params: [{type: ParamType.Character}]
    },
    deop: {
        exec: (conv: ChannelConversation, character: string) =>
            core.connection.send('COR', {channel: conv.channel.id, character}),
        permission: Permission.RoomOwner,
        context: CommandContext.Channel,
        params: [{type: ParamType.Character}]
    },
    oplist: {
        exec: (conv: ChannelConversation) => core.connection.send('COL', {channel: conv.channel.id}),
        context: CommandContext.Channel
    },
    invite: {
        exec: (conv: ChannelConversation, character: string) =>
            core.connection.send('CIU', {channel: conv.channel.id, character}),
        permission: Permission.RoomOp,
        context: CommandContext.Channel,
        params: [{type: ParamType.Character}]
    },
    closeroom: {
        exec: (conv: ChannelConversation) => {
            core.connection.send('RST', {channel: conv.channel.id, status: 'private'});
            core.connection.send('ORS');
        },
        permission: Permission.RoomOwner,
        context: CommandContext.Channel
    },
    openroom: {
        exec: (conv: ChannelConversation) => {
            core.connection.send('RST', {channel: conv.channel.id, status: 'public'});
            core.connection.send('ORS');
        },
        permission: Permission.RoomOwner,
        context: CommandContext.Channel
    },
    setmode: {
        exec: (conv: ChannelConversation, mode: 'ads' | 'chat' | 'both') =>
            core.connection.send('RMO', {channel: conv.channel.id, mode}),
        permission: Permission.RoomOwner,
        context: CommandContext.Channel,
        params: [{type: ParamType.Enum, options: ['ads', 'chat', 'both']}]
    },
    setdescription: {
        exec: (conv: ChannelConversation, description: string) =>
            core.connection.send('CDS', {channel: conv.channel.id, description}),
        permission: Permission.RoomOp,
        context: CommandContext.Channel,
        params: [{type: ParamType.String}]
    },
    code: {
        exec: (conv: ChannelConversation) => {
            const active = <HTMLElement>document.activeElement;
            const elm = document.createElement('textarea');
            elm.value = `[session=${conv.channel.name}]${conv.channel.id}[/session]`;
            document.body.appendChild(elm);
            elm.select();
            document.execCommand('copy');
            document.body.removeChild(elm);
            active.focus();
            conv.infoText = l('commands.code.success');
        },
        permission: Permission.RoomOwner,
        context: CommandContext.Channel
    },
    killchannel: {
        exec: (conv: ChannelConversation) => core.connection.send('KIC', {channel: conv.channel.id}),
        permission: Permission.RoomOwner,
        context: CommandContext.Channel
    },
    createchannel: {
        exec: (channel: string) => core.connection.send('CRC', {channel}),
        permission: Permission.ChatOp,
        params: [{type: ParamType.String}]
    },
    broadcast: {
        exec: (message: string) => core.connection.send('BRO', {message}),
        permission: Permission.Admin,
        params: [{type: ParamType.String}]
    },
    reloadconfig: {
        exec: (save?: 'save') => core.connection.send('RLD', save !== undefined ? {save} : undefined),
        permission: Permission.Admin,
        params: [{type: ParamType.Enum, options: ['save'], optional: true}]
    },
    xyzzy: {
        exec: (command: string, arg: string) => core.connection.send('ZZZ', {command, arg}),
        permission: Permission.Admin,
        params: [{type: ParamType.String, delimiter: ' '}, {type: ParamType.String}]
    },
    elf: {
        exec: () => core.conversations.selectedConversation.infoText =
            'Now no one can say there\'s "not enough Elf." It\'s a well-kept secret, but elves love headpets. You should try it sometime.',
        documented: false
    }
};

export default commands;