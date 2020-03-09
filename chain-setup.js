
const { Qtum } = require("qtumjs")

const rpcURL = "http://user:pass@localhost:13889";
let rpc = new Qtum(rpcURL);

runSetup();

async function runSetup() {
    console.log("Running new chain setup. This process can take several minutes...");

    let addressList = [];
    const addressCount = 10;

    if (process.argv.indexOf("skip-addresses") === -1) {
        console.log(`Generating ${addressCount} addresses...`);
        // generate addresses
        for (let i = 0; i < addressCount; i++) {
            try {
                const result = await rpc.rawCall("getnewaddress");
                addressList.push(result);
            } catch (ex) {
                console.log(i--, "failed generating. try again");
            }
        }
    } else {
        console.log(`Skipping ${addressCount} address creation.`);
        const result = await rpc.rawCall("listreceivedbyaddress", [0, true]);
        for (let i = 0; i < result.length; i++) {
            if (result[i].amount === 0) {
                addressList.push(result[i].address);
            }
        }
    }

    let fundingIndex = 0;
    if (process.argv.indexOf("skip-premine") === -1) {
        fundingIndex = 1
        // fund main address
        const preMineBlocks = 7;
        console.log(`Mining ${preMineBlocks * 100} blocks...`);
        for (let i = 0; i < preMineBlocks; i++) {
            try {
                const result = await rpc.rawCall("generatetoaddress", [100, addressList[0]]);
            } catch (ex) {
                console.log(i--, "failed mining. try again");
            }
        }
    } else {
        console.log(`Skipping premine.`);
    }

    // fund each other address
    console.log(`Funding ${addressList.length} addresses...`);
    while (fundingIndex < addressList.length) {
        let addresses = {};
        for (let i = 0; i < 50; i++) {
            if (addressList[fundingIndex + i]) {
                addresses[addressList[fundingIndex + i]] = 1000;
            }
        }
        try {
            await rpc.rawCall("sendmany", ["", addresses]);
            fundingIndex += 50;
        } catch (ex) {
            console.log(fundingIndex, "failed funding. try again");
        }

    }

    // mine some extra blocks to confirm transactions
    try {
        const result = await rpc.rawCall("generatetoaddress", [10, addressList[0]]);
    } catch (ex) {
        console.log("failed mining");
    }

}




