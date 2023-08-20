require('dotenv').config();

const HDWalletProvider = require('@truffle/hdwallet-provider');
const Web3 = require('web3').default;

const API_URL = process.env.API_URL
const infuraURL = `https://mainnet.infura.io/v3/${process.env.API_KEY}`
const WALLET_KEY = process.env.PRIVATE_KEY;
const privateKeyBuffer = Buffer.from(WALLET_KEY, 'hex');
const logger = require('./utils/logger');
const provider = new HDWalletProvider(WALLET_KEY, infuraURL);
const web3 = new Web3(provider);

let accounts = [];
let user = undefined
let activeMissionsList = [];
let closestMission = undefined;
let squads = []

async function run() {
    accounts = await web3.eth.getAccounts();
    logger.info(`Connected account: ${accounts[0]}`)
    await getUser();

    let currentTime = Math.round(Date.now() / 1000);
    // Claiming squads currently on completed missions
    if (activeMissionsList.length > 0) {
        for (let i = 0; i < activeMissionsList.length; i++) {
            if (activeMissionsList[i].end > currentTime) {
                logger.info(`Found active mission: ${activeMissionsList[i].name}, it's not ready to claim though`)
                continue;
            }
            logger.info(`Found active missions, claiming ${activeMissionsList[i]}`);
            let msg = await getMessage(true, activeMissionsList[i].id, activeMissionsList[i].name, user.nonce, squads[i]);
            let signature = await getSignature(msg);
            await claim(activeMissionsList[i].id, msg, signature)
        }

    }

    // Sending all squads on missions
    for (let i = 0; i < squads.length; i++) {
        let squad = squads[i];
        squad.sort((a, b) => a - b);

        let msg = getMessage(false, closestMission.id, closestMission.name, user.nonce, squads[i]);
        let signature = await getSignature(msg);
        await dispatch(squad, signature, closestMission.id);
    }

    logger.info("Everything is complete")
    provider.engine.stop();
}

function getMessage(isClaim, missionName, nonce, outkastArray) {
    let msg = isClaim ? `Andrometa Signature Service\nDo you validate the following action?:\nClaiming outkasts from mission ${missionName}\nNonce: ${nonce}` :
        `Andrometa Signature Service\nDo you validate the following action?:\nDispatching outkasts #${outkastArray} to mission ${missionName}\nNonce: ${nonce}`;
    return msg;
}

async function dispatch(outkastArray, signature, missionId) {
    let response = await fetch(`${API_URL}/missions/outkasts/${missionId}/dispatch`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            eth_address: accounts[0],
            deployed_tokens: outkastArray,
            signature: signature
        }),
    })

    let json = await response.json()

    if (response.status !== 200) {
        logger.error("Dispatch failed: " + json.message);
    } else if (json.message !== undefined) {
        logger.info(json.message)
    }
}

async function getSignature(message) {
    return await web3.eth.accounts.sign(message, privateKeyBuffer).signature;
}

async function claim(missionId, signature) {
    if (!accounts.length) {
        await initWeb3();
    }

    let response = await fetch(`${API_URL}/missions/outkasts/${missionId}/claim`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            eth_address: accounts[0],
            signature: signature
        }),
    });

    let json = await response.json();

    if (response.status !== 200) {
        logger.error("Claim failed: " + json.message);
    } else if (json.message !== undefined) {
        logger.info(json.message);
    }
}

async function getUser() {
    let response = await fetch(`${API_URL}/users/${accounts[0]}`)
    user = await response.json()
    const sortedTokens = user.tokens.sort((a, b) => b.experience - a.experience);

    for (let i = 0; i < sortedTokens.length; i += 4) {
        squads.push(sortedTokens.slice(i, i + 4).map(token => token.token_id));
    }

    shards = Web3.utils.fromWei(BigInt(Number(user.holdings[0].amount)).toString(), "ether")
    await updateMissions(user.summaries)
}

async function updateMissions(userSummary) {
    if (!userSummary) {
        logger.warn("User summary not provided");
        return;
    }

    try {
        let currentTime = Math.round(Date.now() / 1000)

        let missionResponse = await fetch(`${API_URL}/missions/outkasts`)
        let missions = await missionResponse.json()

        // Checking if the user has any active missions
        if (userSummary !== undefined) {
            for (let activemission of userSummary) {
                activeMissionsList.push(missions.find(m => m.id === activemission.mission_id));
            }
        }

        // Filter out missions starting in the future
        const past24HoursMissions = missions.filter(mission => mission.start > currentTime - 86400 && mission.start <= currentTime);
        past24HoursMissions.sort((a, b) => (a.end - a.start) - (b.end - b.start));
        closestMission = past24HoursMissions[0];

        if (closestMission) {
            logger.info("Mission that ends the quickest:" + closestMission.id);
            logger.info("Mission starts at:" + new Date(closestMission.start * 1000).toLocaleString() + "and ends at:" + new Date(closestMission.end * 1000).toLocaleString());
        }
    }
    catch (e) {
        console.log(e)
        logger.error("Error fetching missions, the servers could be down, please alert the devs on discord.")
    }
}
run().catch(console.error); 