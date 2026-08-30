import z from '../lib/zod/lib/index.mjs';
import { fallbackToDefault } from '../utils/zodUtils.mjs';

/**
 * This file is generated.
 * Run "npm run sync" to regenerate file.
 * @generated
 */
// INITIATE_IMAGE_UPLOAD
const InitiateImageUploadResponseSchema = z.object({ image_url: z.string() });
// OPEN_SHARE_MOMENT_DIALOG
const OpenShareMomentDialogRequestSchema = z.object({ mediaUrl: z.string().max(1024) });
// AUTHENTICATE
const AuthenticateRequestSchema = z.object({ access_token: z.union([z.string(), z.null()]).optional() });
const AuthenticateResponseSchema = z.object({
    access_token: z.string(),
    user: z.object({
        username: z.string(),
        discriminator: z.string(),
        id: z.string(),
        avatar: z.union([z.string(), z.null()]).optional(),
        public_flags: z.number(),
        global_name: z.union([z.string(), z.null()]).optional(),
    }),
    scopes: z.array(fallbackToDefault(z
        .enum([
        'identify',
        'email',
        'connections',
        'guilds',
        'guilds.join',
        'guilds.members.read',
        'guilds.channels.read',
        'gdm.join',
        'bot',
        'rpc',
        'rpc.notifications.read',
        'rpc.voice.read',
        'rpc.voice.write',
        'rpc.video.read',
        'rpc.video.write',
        'rpc.screenshare.read',
        'rpc.screenshare.write',
        'rpc.activities.write',
        'webhook.incoming',
        'messages.read',
        'applications.builds.upload',
        'applications.builds.read',
        'applications.commands',
        'applications.commands.permissions.update',
        'applications.commands.update',
        'applications.store.update',
        'applications.entitlements',
        'activities.read',
        'activities.write',
        'relationships.read',
        'relationships.write',
        'voice',
        'dm_channels.read',
        'role_connections.write',
        'presences.read',
        'presences.write',
        'openid',
        'dm_channels.messages.read',
        'dm_channels.messages.write',
        'gateway.connect',
        'account.global_name.update',
        'payment_sources.country_code',
        'sdk.social_layer',
    ])
        .or(z.literal(-1))
        .default(-1))),
    expires: z.string(),
    application: z.object({
        description: z.string(),
        icon: z.union([z.string(), z.null()]).optional(),
        id: z.string(),
        rpc_origins: z.array(z.string()).optional(),
        name: z.string(),
    }),
});
// GET_ACTIVITY_INSTANCE_CONNECTED_PARTICIPANTS
const GetActivityInstanceConnectedParticipantsResponseSchema = z.object({
    participants: z.array(z.object({
        id: z.string(),
        username: z.string(),
        global_name: z.union([z.string(), z.null()]).optional(),
        discriminator: z.string(),
        avatar: z.union([z.string(), z.null()]).optional(),
        flags: z.number(),
        bot: z.boolean(),
        avatar_decoration_data: z
            .union([z.object({ asset: z.string(), skuId: z.string().optional() }), z.null()])
            .optional(),
        premium_type: z.union([z.number(), z.null()]).optional(),
        nickname: z.string().optional(),
    })),
});
// SHARE_INTERACTION
const ShareInteractionRequestSchema = z.object({
    command: z.string(),
    content: z.string().max(2000).optional(),
    preview_image: z.object({ height: z.number(), url: z.string(), width: z.number() }).optional(),
    components: z
        .array(z.object({
        type: z.literal(1),
        components: z
            .array(z.object({
            type: z.literal(2),
            style: z.number().gte(1).lte(5),
            label: z.string().max(80).optional(),
            custom_id: z
                .string()
                .max(100)
                .describe('Developer-defined identifier for the button; max 100 characters')
                .optional(),
        }))
            .max(5)
            .optional(),
    }))
        .optional(),
});
// SHARE_LINK
const ShareLinkRequestSchema = z.object({
    referrer_id: z.string().max(64).optional(),
    custom_id: z.string().max(64).optional(),
    message: z.string().max(1000),
});
const ShareLinkResponseSchema = z.object({ success: z.boolean() });
/**
 * RPC Commands which support schemas.
 */
var Command;
(function (Command) {
    Command["INITIATE_IMAGE_UPLOAD"] = "INITIATE_IMAGE_UPLOAD";
    Command["OPEN_SHARE_MOMENT_DIALOG"] = "OPEN_SHARE_MOMENT_DIALOG";
    Command["AUTHENTICATE"] = "AUTHENTICATE";
    Command["GET_ACTIVITY_INSTANCE_CONNECTED_PARTICIPANTS"] = "GET_ACTIVITY_INSTANCE_CONNECTED_PARTICIPANTS";
    Command["SHARE_INTERACTION"] = "SHARE_INTERACTION";
    Command["SHARE_LINK"] = "SHARE_LINK";
})(Command || (Command = {}));
const emptyResponseSchema = z.object({}).optional().nullable();
const emptyRequestSchema = z.void();
/**
 * Request & Response schemas for each supported RPC Command.
 */
const Schemas = {
    [Command.INITIATE_IMAGE_UPLOAD]: {
        request: emptyRequestSchema,
        response: InitiateImageUploadResponseSchema,
    },
    [Command.OPEN_SHARE_MOMENT_DIALOG]: {
        request: OpenShareMomentDialogRequestSchema,
        response: emptyResponseSchema,
    },
    [Command.AUTHENTICATE]: {
        request: AuthenticateRequestSchema,
        response: AuthenticateResponseSchema,
    },
    [Command.GET_ACTIVITY_INSTANCE_CONNECTED_PARTICIPANTS]: {
        request: emptyRequestSchema,
        response: GetActivityInstanceConnectedParticipantsResponseSchema,
    },
    [Command.SHARE_INTERACTION]: {
        request: ShareInteractionRequestSchema,
        response: emptyResponseSchema,
    },
    [Command.SHARE_LINK]: {
        request: ShareLinkRequestSchema,
        response: ShareLinkResponseSchema,
    },
};

export { AuthenticateRequestSchema, AuthenticateResponseSchema, Command, GetActivityInstanceConnectedParticipantsResponseSchema, InitiateImageUploadResponseSchema, OpenShareMomentDialogRequestSchema, Schemas, ShareInteractionRequestSchema, ShareLinkRequestSchema, ShareLinkResponseSchema };
