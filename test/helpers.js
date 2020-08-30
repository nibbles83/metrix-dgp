
const { Qtum } = require("qtumjs")
const solc = require('solc')
const fs = require('fs-extra')
const path = require('path')
const createKeccakHash = require('keccak')

const rpcURL = "http://user:pass@localhost:33841";
let qtum = new Qtum(rpcURL);
let mainAddress = "";
let mainAddressHex = "";

/*
Contract deployment functions
*/
async function deploy(contractNames) {
    let solar = {
        "contracts": {
        }
    }
    let testData = {
        gasScheduleAddress: '',
        blockSizeAddress: '',
        minGasPriceAddress: '',
        blockGasLimitAddress: '',
        transactionFeeRatesAddress: '',
        governanceCollateralAddress: '',
        budgetFeeAddress: '',
        DGPAddress: '',
        governanceAddress: ''
    }
    for (let i = 0; i < contractNames.length; i++) {
        let name = contractNames[i];
        let builtContract = buildContract(name, testData);
        builtContract = builtContract.contracts[name][name.split(".")[0].split("-")[0]]
        let deployment = await deployContract(name, builtContract);

        solar.contracts[name] = {
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

        if (i === 0) {
            mainAddress = deployment.sender;
            mainAddressHex = deployment.hash160;
        }

        if (name === 'gasSchedule-dgp.sol') testData.gasScheduleAddress = toChecksumAddress(deployment.address)
        if (name === 'blockSize-dgp.sol') testData.blockSizeAddress = toChecksumAddress(deployment.address)
        if (name === 'minGasPrice-dgp.sol') testData.minGasPriceAddress = toChecksumAddress(deployment.address)
        if (name === 'blockGasLimit-dgp.sol') testData.blockGasLimitAddress = toChecksumAddress(deployment.address)
        if (name === 'transactionFeeRates-dgp.sol') testData.transactionFeeRatesAddress = toChecksumAddress(deployment.address)
        if (name === 'governanceCollateral-dgp.sol') testData.governanceCollateralAddress = toChecksumAddress(deployment.address)
        if (name === 'budgetFee-dgp.sol') testData.budgetFeeAddress = toChecksumAddress(deployment.address)
        if (name === 'DGP.sol') testData.DGPAddress = toChecksumAddress(deployment.address)
        if (name === 'Governance.sol') testData.governanceAddress = toChecksumAddress(deployment.address)
    }

    qtum = new Qtum(rpcURL, solar);
}

function buildContract(name, testData, customData) {
    let contract = fs.readFileSync(path.resolve(__dirname, '../', 'contracts', name), 'utf8');

    // set some dev variables for Governance.sol
    if (name === 'Governance.sol') {
        contract = contract.replace("uint16 private _pingBlockInterval = 30 * 960;", "uint16 private _pingBlockInterval = 40;")
        contract = contract.replace("uint16 private _blockBeforeGovernorVote = 28 * 960;", "uint16 private _blockBeforeGovernorVote = 40;")
        contract = contract.replace("uint16 private _rewardBlockInterval = 1920;", "uint16 private _rewardBlockInterval = 100;")
        contract = contract.replace("uint16 private _blockBeforeMatureGovernor = 15;", "uint16 private _blockBeforeMatureGovernor = 10;")
    } else if (name === 'DGP.sol') {
        contract = contract.replace("uint16 private _minimumGovernors = 100;", "uint16 private _minimumGovernors = 3;")
        contract = contract.replace("0x0000000000000000000000000000000000000089", "0x0");
        contract = contract.replace("uint16 private _proposalExpiryBlocks = 14 * 960;", "uint16 private _proposalExpiryBlocks = 5;");

    } else if (name === "Budget.sol") {
        contract = contract.replace("uint16 private _minimumGovernors = 100;", "uint16 private _minimumGovernors = 10;")
        contract = contract.replace("uint256 private _budgetPeriod = 29220", "uint256 private _budgetPeriod = 1")
    } else if (name === "governanceCollateral-dgp.sol") {
        contract = contract.replace("7500000E8", "10E8")
    } else if (name === "budgetFee-dgp.sol") {
        contract = contract.replace("600000E8", "1E8")
    }
    // set contract addresses if necessary
    if (testData.gasScheduleAddress) contract = contract.replace("0x0000000000000000000000000000000000000080", testData.gasScheduleAddress)
    if (testData.blockSizeAddress) contract = contract.replace("0x0000000000000000000000000000000000000081", testData.blockSizeAddress)
    if (testData.minGasPriceAddress) contract = contract.replace("0x0000000000000000000000000000000000000082", testData.minGasPriceAddress)
    if (testData.blockGasLimitAddress) contract = contract.replace("0x0000000000000000000000000000000000000083", testData.blockGasLimitAddress)
    if (testData.transactionFeeRatesAddress) contract = contract.replace("0x0000000000000000000000000000000000000084", testData.transactionFeeRatesAddress)
    if (testData.governanceCollateralAddress) contract = contract.replace("0x0000000000000000000000000000000000000086", testData.governanceCollateralAddress)
    if (testData.budgetFeeAddress) contract = contract.replace("0x0000000000000000000000000000000000000087", testData.budgetFeeAddress)
    if (testData.DGPAddress) contract = contract.replace("0x0000000000000000000000000000000000000088", testData.DGPAddress)
    if (testData.governanceAddress) contract = contract.replace("0x0000000000000000000000000000000000000089", testData.governanceAddress)
    // set any custom data
    if (customData) {
        customData.forEach(item => {
            contract = contract.replace(item[0], item[1]);
        })
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

    return JSON.parse(solc.compileStandardWrapper(JSON.stringify(input), getImports))
}

async function deployContract(name, contract) {
    const bytecode = contract.evm.bytecode.object;
    let res = await qtum.rawCall("createcontract", [bytecode, 5000000]);
    // create block to confirm transaction 
    let block = await qtum.rawCall("generatetoaddress", [1, res.sender]);
    return res;
}

function deployCustomContract(name, data) {
    let builtContract = buildContract(name, {}, data);
    builtContract = builtContract.contracts[name][name.split(".")[0].split("-")[0]]
    return deployContract(name, builtContract);
}

function toChecksumAddress(address) {
    address = address.toLowerCase();
    var hash = createKeccakHash('keccak256').update(address).digest('hex')
    var ret = '0x';
    for (let i = 0; i < address.length; i++) {
        if (parseInt(hash[i], 16) >= 8) {
            ret += address[i].toUpperCase()
        } else {
            ret += address[i]
        }
    }
    return ret;
}

module.exports = {
    deploy,
    deployCustomContract,
    qtum: () => { return qtum },
    mainAddress: () => { return mainAddress },
    mainAddressHex: () => { return mainAddressHex }
}
