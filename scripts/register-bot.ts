import { createTownsClient, parseAppPrivateData, userIdToAddress } from '@towns-protocol/sdk'
import { RegisterRequestSchema, AppMetadataSchema, UpdateAppMetadataRequestSchema, AppMetadataUpdateSchema } from '@towns-protocol/proto'
import { create } from '@bufbuild/protobuf'
import config from '../src/config'
import commands from '../src/commands'

async function main() {
    const appPrivateData = process.env.APP_PRIVATE_DATA;
    const jwtSecret = process.env.JWT_SECRET;

    if (!appPrivateData || !jwtSecret) {
        console.error('Missing APP_PRIVATE_DATA or JWT_SECRET in .env');
        return;
    }

    console.log('Parsing bot credentials...');
    const parsed = parseAppPrivateData(appPrivateData);

    console.log('Creating Towns client...');
    const client = await createTownsClient({
        privateKey: parsed.privateKey,
        env: parsed.env,
    });

    console.log('Authenticating with App Registry...');
    const appRegistry = await client.appServiceClient();

    const botId = client.userId;
    const appId = userIdToAddress(botId);

    // Using bot address as owner address for registration
    const appOwnerId = appId;

    console.log(`Bot ID: ${botId}`);

    const metadata = {
        username: 'roninotc_bot', // Unique username
        displayName: 'RoninOTC',
        description: 'Trustless OTC escrow on Base with USDC.',
        imageUrl: 'https://roninotc-app.vercel.app/logo.png',
        avatarUrl: 'https://roninotc-app.vercel.app/logo.png',
        externalUrl: 'https://roninotc-app.vercel.app',
        motto: 'Trustless OTC Escrow on Base',
        slashCommands: commands.map(c => ({
            name: c.name,
            description: c.description
        }))
    };

    try {
        console.log('Checking existing registration...');
        const existing = await appRegistry.getAppMetadata({ appId });

        if (existing && existing.metadata) {
            console.log('Bot already registered. Updating metadata...');

            const updateReq = create(UpdateAppMetadataRequestSchema, {
                appId,
                metadata: create(AppMetadataUpdateSchema, {
                    displayName: metadata.displayName,
                    description: metadata.description,
                    imageUrl: metadata.imageUrl,
                    avatarUrl: metadata.avatarUrl,
                    externalUrl: metadata.externalUrl,
                    motto: metadata.motto,
                    slashCommands: metadata.slashCommands,
                }),
                updateMask: ['display_name', 'description', 'image_url', 'avatar_url', 'external_url', 'slash_commands', 'motto']
            });

            await appRegistry.updateAppMetadata(updateReq);
            console.log('Metadata updated successfully!');
        } else {
            throw new Error('Not found');
        }
    } catch (e) {
        console.log('Bot not registered. Attempting new registration...');

        const regReq = create(RegisterRequestSchema, {
            appId,
            appOwnerId,
            metadata: create(AppMetadataSchema, metadata)
        });

        await appRegistry.register(regReq);
        console.log('Registration successful!');
    }

    // Set active status just in case
    try {
        await appRegistry.setAppActiveStatus({ appId, active: true });
        console.log('Bot set to ACTIVE status.');
    } catch (e) {
        console.warn('Failed to set active status, but registration might still be OK.');
    }

    console.log('\n--- SUCCESS ---');
    console.log('Your bot is now registered in the Towns App Registry.');
    console.log('The "Open App" buttons should now render correctly in the Towns UI.');
    process.exit(0);
}

main().catch(err => {
    console.error('\n--- ERROR ---');
    console.error(err);
    process.exit(1);
});
