import { createTownsClient, parseAppPrivateData } from '@towns-protocol/sdk'
import { bin_fromHexString } from '@towns-protocol/utils'

async function checkMetadata() {
    console.log('Fetching current metadata from Towns App Registry...')

    try {
        const privateData = process.env.APP_PRIVATE_DATA
        if (!privateData) {
            console.error('APP_PRIVATE_DATA is missing in .env')
            return
        }

        const { appAddress, env, privateKey } = parseAppPrivateData(privateData)

        if (!appAddress) {
            console.error('Failed to get appId from APP_PRIVATE_DATA')
            return
        }

        console.log('Parsed Bot ID:', appAddress)
        console.log('Environment:', env)

        const client = await createTownsClient({ env, privateKey })
        const appRegistry = await client.appServiceClient()

        const response = await appRegistry.getAppMetadata({
            appId: bin_fromHexString(appAddress),
        })

        console.log('\n--- CURRENT REGISTRY METADATA ---')
        console.log('Display Name:', response.metadata?.displayName)
        console.log('Username:', response.metadata?.username)
        console.log('Description:', response.metadata?.description)
        console.log('External URL:', response.metadata?.externalUrl)
        console.log('Motto:', response.metadata?.motto)
        console.log('Commands:', response.metadata?.slashCommands.map(c => c.name))
        console.log('----------------------------------\n')

        if (response.metadata?.displayName === 'RoninOTC') {
            console.log('✅ Registry is UP TO DATE with "RoninOTC".')
        } else {
            console.log('❌ Registry STILL SHOWS old name:', response.metadata?.displayName)
        }
    } catch (err) {
        console.error('Error fetching metadata:', err)
    }
}

checkMetadata()
