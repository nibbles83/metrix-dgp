
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

const defaultRequiredCollateral = 10;
const satoshi = 1E8;

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

    it('Should exist in governors list', async function () {
        const result = await contract.call("governors", [dummyAddressHex]);
        let blockHeight = result.outputs[0].toNumber();
        let collateral = Number(Big(result.outputs[1]).div(satoshi));
        expect(blockHeight).to.exist;
        expect(collateral).to.equal(defaultRequiredCollateral);
    });
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
    const getImports = (dependency) => {
        return { contents: fs.readFileSync(path.resolve(__dirname, '../', 'contracts', dependency), 'utf8') };
    }

    var input = {
        language: 'Solidity',
        sources: {
            [name]: {
                content: fs.readFileSync(path.resolve(__dirname, '../', 'contracts', name), 'utf8')
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