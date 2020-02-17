
const expect = require('chai').expect;
const { Qtum } = require("qtumjs")
const solc = require('solc')
const fs = require('fs-extra')
const path = require('path')
const Big = require('big.js');

const rpcURL = "http://user:pass@localhost:13889";
let qtum = new Qtum(rpcURL);
let dummyAddress = "";
let dummyAddressHex = "";
let contract;
let governorAddressList = [];

const defaultRequiredCollateral = 10;
const satoshi = 1E8;
const reward = 1;

// compile and deploy contract before tests
before(async () => {
    await deploy('Governance.sol')
})

describe('Governance.sol', function () {
    it('Should have 0 balance', async function () {
        const result = await contract.call("balance");
        const balance = result.outputs[0].toNumber();
        expect(balance).to.equal(0);
    });

    it('Should have collateral of 10 MRX', async function () {
        const result = await contract.call("requiredCollateral");
        const collateral = Number(Big(result.outputs[0]).div(satoshi));
        expect(collateral).to.equal(defaultRequiredCollateral);
    });

    it('Should enroll fail to enroll a new governor because no collateral is given', async function () {
        const tx = await contract.send("enroll", [])
        await qtum.rawCall("generatetoaddress", [1, dummyAddress]);
        const receipt = await tx.confirm(1)
        expect(receipt.excepted).to.equal("Revert");
        expect(receipt.exceptedMessage).to.equal("Collateral is required for enrollment");
    });

    it('Should enroll fail to enroll a new governor because collateral is too low', async function () {
        const tx = await contract.send("enroll", [], { amount: defaultRequiredCollateral - 1 })
        await qtum.rawCall("generatetoaddress", [1, dummyAddress]);
        const receipt = await tx.confirm(1)
        expect(receipt.excepted).to.equal("Revert");
        expect(receipt.exceptedMessage).to.equal("New collateral must be exact");
    });

    it('Should enroll fail to enroll a new governor because collateral is too high', async function () {
        const tx = await contract.send("enroll", [], { amount: defaultRequiredCollateral - 1 })
        await qtum.rawCall("generatetoaddress", [1, dummyAddress]);
        const receipt = await tx.confirm(1)
        expect(receipt.excepted).to.equal("Revert");
        expect(receipt.exceptedMessage).to.equal("New collateral must be exact");
    });

    it('Should still have 0 balance after failed enrollment', async function () {
        const result = await contract.call("balance");
        const balance = result.outputs[0].toNumber();
        expect(balance).to.equal(0);
    });

    it('Should enroll a new governor', async function () {
        const tx = await contract.send("enroll", [], { amount: defaultRequiredCollateral })
        await qtum.rawCall("generatetoaddress", [1, dummyAddress]);
        const receipt = await tx.confirm(1)
        expect(receipt.excepted).to.equal("None");
    });

    it('Should have 1 governors balance', async function () {
        const result = await contract.call("balance");
        const balance = Number(Big(result.outputs[0]).div(satoshi));
        expect(balance).to.equal(defaultRequiredCollateral);
    });

    it('Should have 1 governor', async function () {
        const result = await contract.call("governorCount");
        const count = Number(result.outputs[0]);
        expect(count).to.equal(1);
    });

    it('Should exist in governors list', async function () {
        const result = await contract.call("governors", [dummyAddressHex]);
        let blockHeight = result.outputs[0].toNumber();
        let ping = result.outputs[1].toNumber();
        let collateral = Number(Big(result.outputs[2]).div(satoshi));
        let lastReward = result.outputs[3].toNumber();
        expect(blockHeight).to.exist;
        expect(blockHeight).to.equal(ping);
        expect(collateral).to.equal(defaultRequiredCollateral);
        expect(lastReward).to.equal(0);
    });

    it('Should fail to ping immature governor', async function () {
        let result = await contract.rawCall("ping");
        expect(result.executionResult.excepted).to.equal("Revert");
        expect(result.executionResult.exceptedMessage).to.equal("Governor is not currently valid");
    });

    it('Should fail to add proposal due to not enough governors', async function () {
        let result = await contract.rawCall("addProposal", [1, 15]);
        expect(result.executionResult.excepted).to.equal("Revert");
        expect(result.executionResult.exceptedMessage).to.equal("Not enough governors to enable voting");
    });

    it('Should fail to reward since reward is to high', async function () {
        const tx = await contract.send("rewardGovernor", [], { amount: reward + 1 })
        await qtum.rawCall("generatetoaddress", [1, dummyAddress]);
        const receipt = await tx.confirm(1)
        expect(receipt.excepted).to.equal("Revert");
        expect(receipt.exceptedMessage).to.equal("Reward is too high");
    });

    it('Should fail to reward since no mature governor', async function () {
        const tx = await contract.send("rewardGovernor", [], { amount: reward })
        await qtum.rawCall("generatetoaddress", [1, dummyAddress]);
        const receipt = await tx.confirm(1)
        expect(receipt.excepted).to.equal("Revert");
        expect(receipt.exceptedMessage).to.equal("No winner could be determined");
    });

    it('Should ping valid governor', async function () {
        let result = await contract.call("governors", [dummyAddressHex]);
        let startPing = result.outputs[1].toNumber();
        await qtum.rawCall("generatetoaddress", [10, dummyAddress]);
        const tx = await contract.send("ping");
        await qtum.rawCall("generatetoaddress", [1, dummyAddress]);
        const receipt = await tx.confirm(1)
        result = await contract.call("governors", [dummyAddressHex]);
        let newPing = result.outputs[1].toNumber();
        expect(startPing).to.be.lessThan(newPing);
    });

    it('Should reward governor', async function () {
        const tx = await contract.send("rewardGovernor", [], { amount: reward })
        await qtum.rawCall("generatetoaddress", [1, dummyAddress]);
        const receipt = await tx.confirm(1)
        const result = await contract.call("governors", [dummyAddressHex]);
        let lastReward = result.outputs[3].toNumber();
        expect(lastReward).to.be.greaterThan(0);
    });

    it('Should enroll 2 governors', async function () {
        const addresses = await qtum.rawCall("listreceivedbyaddress");
        let enrolled = 0;
        let addrIndex = 0;
        while (enrolled < 2) {
            if (addresses[addrIndex].address !== dummyAddress) {
                const tx = await contract.send("enroll", [], { amount: defaultRequiredCollateral, senderAddress: addresses[addrIndex].address })
                await qtum.rawCall("generatetoaddress", [1, dummyAddress]);
                const receipt = await tx.confirm(1);
                expect(receipt.excepted).to.equal("None");
                enrolled++;
                governorAddressList.push(addresses[addrIndex].address)
            }
            addrIndex++
        }
        expect(enrolled).to.equal(2);
    });

    it('Should add proposal to change collateral', async function () {
        let tx = await contract.send("addProposal", [1, 15 * satoshi]);
        await qtum.rawCall("generatetoaddress", [1, dummyAddress]);
        const receipt = await tx.confirm(1);
        expect(receipt.excepted).to.equal("None");
        result = await contract.call("proposal");
        const onVote = result.outputs[0];
        const proposalAmount = Number(Big(result.outputs[1]).div(satoshi));
        const proposalType = Number(result.outputs[3]);
        expect(onVote).to.equal(true);
        expect(proposalAmount).to.equal(15);
        expect(proposalType).to.equal(1);
    });

    it('Should expire the active proposal', async function () {
        await qtum.rawCall("generatetoaddress", [6, dummyAddress]);
        let tx = await contract.send("addProposal", [1, 15]);
        await qtum.rawCall("generatetoaddress", [1, dummyAddress]);
        const receipt = await tx.confirm(1);
        const result = await contract.call("proposal");
        const onVote = result.outputs[0];
        expect(onVote).to.equal(false);
    });

    it('Should pass proposal to increase collateral', async function () {
        // create proposal
        let tx = await contract.send("addProposal", [1, 15 * satoshi]);
        await qtum.rawCall("generatetoaddress", [1, dummyAddress]);
        let receipt = await tx.confirm(1);
        expect(receipt.excepted).to.equal("None");
        // check double vote fails
        tx = await contract.send("addProposal", [1, 15 * satoshi]);
        await qtum.rawCall("generatetoaddress", [1, dummyAddress]);
        receipt = await tx.confirm(1);
        expect(receipt.excepted).to.equal("Revert");
        expect(receipt.exceptedMessage).to.equal("Governor has already voted");
        // add another voter
        tx = await contract.send("addProposal", [1, 15 * satoshi], { senderAddress: governorAddressList[0] });
        await qtum.rawCall("generatetoaddress", [1, dummyAddress]);
        receipt = await tx.confirm(1);
        expect(receipt.excepted).to.equal("None");
        // get proposal statue
        let result = await contract.call("proposal");
        const onVote = result.outputs[0];
        expect(onVote).to.equal(false);
        // get collateral 
        result = await contract.call("requiredCollateral");
        const collateral = Number(Big(result.outputs[0]).div(satoshi));
        expect(collateral).to.equal(15);
    });

    it('Should not have any valid governors as collateral has changed', async function () {
        const tx = await contract.send("rewardGovernor", [], { amount: reward })
        await qtum.rawCall("generatetoaddress", [1, dummyAddress]);
        const receipt = await tx.confirm(1)
        expect(receipt.excepted).to.equal("Revert");
        expect(receipt.exceptedMessage).to.equal("No winner could be determined");
    });

    it('Should top up governors collateral', async function () {
        const tx = await contract.send("enroll", [], { amount: 5 })
        await qtum.rawCall("generatetoaddress", [1, dummyAddress]);
        const receipt = await tx.confirm(1)
        expect(receipt.excepted).to.equal("None");
        const result = await contract.call("governors", [dummyAddressHex]);
        let collateral = Number(Big(result.outputs[2]).div(satoshi));
        expect(collateral).to.equal(15);
    });

    it('Should pass proposal to reduce collateral', async function () {
        // topup another governor for voting
        let tx = await contract.send("enroll", [], { amount: 5, senderAddress: governorAddressList[0] })
        await qtum.rawCall("generatetoaddress", [1, dummyAddress]);
        let receipt = await tx.confirm(1)
        expect(receipt.excepted).to.equal("None");
        // make governors mature
        await qtum.rawCall("generatetoaddress", [10, dummyAddress]);
        // create proposal
        tx = await contract.send("addProposal", [1, defaultRequiredCollateral * satoshi]);
        await qtum.rawCall("generatetoaddress", [1, dummyAddress]);
        receipt = await tx.confirm(1);
        expect(receipt.excepted).to.equal("None");
        // add another voter
        tx = await contract.send("addProposal", [1, defaultRequiredCollateral * satoshi], { senderAddress: governorAddressList[0] });
        await qtum.rawCall("generatetoaddress", [1, dummyAddress]);
        receipt = await tx.confirm(1);
        expect(receipt.excepted).to.equal("None");
        // get collateral 
        result = await contract.call("requiredCollateral");
        const collateral = Number(Big(result.outputs[0]).div(satoshi));
        expect(collateral).to.equal(defaultRequiredCollateral);
    });

    it('Should reduce governors collateral', async function () {
        const tx = await contract.send("unenroll", [false])
        await qtum.rawCall("generatetoaddress", [1, dummyAddress]);
        const receipt = await tx.confirm(1)
        expect(receipt.excepted).to.equal("None");
        const result = await contract.call("governors", [dummyAddressHex]);
        let collateral = Number(Big(result.outputs[2]).div(satoshi));
        expect(collateral).to.equal(defaultRequiredCollateral);
    });

    it('Should unenroll governor', async function () {
        const tx = await contract.send("unenroll", [true], { senderAddress: governorAddressList[0] })
        await qtum.rawCall("generatetoaddress", [1, dummyAddress]);
        const receipt = await tx.confirm(1)
        expect(receipt.excepted).to.equal("None");
        const hexAddress = await qtum.rawCall("gethexaddress", [governorAddressList[0]]);
        const result = await contract.call("governors", [hexAddress]);
        let blockHeight = result.outputs[0].toNumber();
        let ping = result.outputs[1].toNumber();
        let collateral = result.outputs[1].toNumber();
        let lastReward = result.outputs[3].toNumber();
        let addressIndex = result.outputs[4].toNumber();
        expect(blockHeight).to.equal(0);
        expect(ping).to.equal(0);
        expect(collateral).to.equal(0);
        expect(lastReward).to.equal(0);
        expect(addressIndex).to.equal(0);
    });

    /* describe('Governance Limit Tests', function () {
        it('Should enroll 2000 governors', async function () {
            const addresses = await qtum.rawCall("listreceivedbyaddress");
            expect(addresses.length).to.be.greaterThan(1999);
            let txList = [];
            for (let i = 0; i < 2000; i++) {
                const tx = await contract.send("enroll", [], { amount: defaultRequiredCollateral,senderAddress:addresses[i].address })
                txList.push(tx.confirm(1));
               
            }
            await Promise.all(txList);
            let t = 5;
        })
    }) */
});



/*
Contract deployment functions
*/
async function deploy(name) {
    let builtContract = buildContract(name);
    builtContract = builtContract.contracts[name][name.split(".")[0]]
    let deployment = await deployContract(name, builtContract);

    let solar = {
        "contracts": {
            [name]: {
                abi: builtContract.abi,
                "bin": builtContract.evm.bytecode.object,
                "binhash": "",
                "name": name.split(".")[0],
                "deployName": name,
                "address": deployment.address,
                "txid": deployment.txid,
                "createdAt": new Date(),
                "confirmed": true,
                "sender": deployment.sender,
                "senderHex": deployment.hash160
            }
        }
    }

    dummyAddress = deployment.sender;
    dummyAddressHex = deployment.hash160;
    qtum = new Qtum(rpcURL, solar);
    contract = qtum.contract(name);
}

function buildContract(name) {
    let contract = fs.readFileSync(path.resolve(__dirname, '../', 'contracts', name), 'utf8');

    // set some dev variables for Governance.sol
    if (name === 'Governance.sol') {
        contract = contract.replace("uint16 private _minimumGovernors = 100;", "uint16 private _minimumGovernors = 3;")
    }

    const getImports = (dependency) => {
        return { contents: fs.readFileSync(path.resolve(__dirname, '../', 'contracts', dependency), 'utf8') };
    }

    var input = {
        language: 'Solidity',
        sources: {
            [name]: {
                content: contract
            }
        },
        settings: {
            outputSelection: {
                '*': {
                    '*': ['*']
                }
            }
        }
    };

    //var output = JSON.parsesolc.compileStandardWrapper(JSON.stringify(input), getImports))

    return JSON.parse(solc.compileStandardWrapper(JSON.stringify(input), getImports))
}

async function deployContract(name, contract) {
    const bytecode = contract.evm.bytecode.object;
    let res = await qtum.rawCall("createcontract", [bytecode]);
    // create block to confirm transaction 
    let block = await qtum.rawCall("generatetoaddress", [1, res.sender]);
    return res;
}



/*
async function balanceOf(owner) {
    const res = await myToken.call("balanceOf", [owner])

    // balance is a BigNumber instance (see: bn.js)
    const balance = res.outputs[0]

    console.log(`balance:`, balance.toNumber())
}

async function mint(toAddr, amount) {
    const tx = await myToken.send("mint", [toAddr, amount])

    console.log("mint tx:", tx.txid)
    console.log(tx)

    // or: await tx.confirm(1)
    const confirmation = tx.confirm(1)
    ora.promise(confirmation, "confirm mint")
    const receipt = await confirmation
    console.log("tx receipt:", JSON.stringify(receipt, null, 2))
}

async function transfer(fromAddr, toAddr, amount) {
    const tx = await myToken.send("transfer", [toAddr, amount], {
        senderAddress: fromAddr,
    })

    console.log("transfer tx:", tx.txid)
    console.log(tx)

    // or: await tx.confirm(1)
    const confirmation = tx.confirm(1)
    ora.promise(confirmation, "confirm transfer")
    await confirmation
}

async function streamEvents() {
    console.log("Subscribed to contract events")
    console.log("Ctrl-C to terminate events subscription")

    myToken.onLog((entry) => {
        console.log(entry)
    }, { minconf: 1 })
}

async function getLogs(fromBlock, toBlock) {
    const logs = await myToken.logs({
        fromBlock,
        toBlock,
        minconf: 1,
    })

    console.log(JSON.stringify(logs, null, 2))
}

async function main() {
    const argv = parseArgs(process.argv.slice(2))

    const cmd = argv._[0]

    if (process.env.DEBUG) {
        console.log("argv", argv)
        console.log("cmd", cmd)
    }

    switch (cmd) {
        case "supply":
        case "totalSupply":
            await totalSupply()
            break
        case "balance":
            const owner = argv._[1]
            if (!owner) {
                throw new Error("please specify an address")
            }
            await balanceOf(owner)
            break
        case "mint":
            const mintToAddr = argv._[1]
            const mintAmount = parseInt(argv._[2])
            await mint(mintToAddr, mintAmount)

            break
        case "transfer":
            const fromAddr = argv._[1]
            const toAddr = argv._[2]
            const amount = argv._[3]

            await transfer(fromAddr, toAddr, amount)
            break
        case "logs":
            const fromBlock = parseInt(argv._[1]) || 0
            const toBlock = parseInt(argv._[2]) || "latest"

            await getLogs(fromBlock, toBlock)
            break
        case "events":
            await streamEvents() // logEvents will never return
            break
        default:
            console.log("unrecognized command", cmd)
    }
}

main().catch(err => {
    console.log("error", err)
})
*/