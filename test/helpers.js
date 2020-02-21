
const { Qtum } = require("qtumjs")
const solc = require('solc')
const fs = require('fs-extra')
const path = require('path')

const rpcURL = "http://user:pass@localhost:13889";
let qtum = new Qtum(rpcURL);
let mainAddress = "";
let mainAddressHex = "";
let contract;

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

    mainAddress = deployment.sender;
    mainAddressHex = deployment.hash160;
    qtum = new Qtum(rpcURL, solar);
    contract = qtum.contract(name);
}

function buildContract(name) {
    let contract = fs.readFileSync(path.resolve(__dirname, '../', 'contracts', name), 'utf8');

    // set some dev variables for Governance.sol
    if (name === 'Governance.sol') {
        contract = contract.replace("uint16 private _minimumGovernors = 100;", "uint16 private _minimumGovernors = 3;")
        contract = contract.replace("uint16 private _pingBlockInterval = 30 * 960;", "uint16 private _pingBlockInterval = 40;")
        contract = contract.replace("uint16 private _rewardBlockInterval = 2000;", "uint16 private _rewardBlockInterval = 100;")
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


module.exports = {
    deploy,
    qtum: () => { return qtum },
    mainAddress: () => { return mainAddress },
    mainAddressHex: () => { return mainAddressHex },
    contract: () => { return contract }
}
