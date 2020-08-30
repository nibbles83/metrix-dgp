The Metrix Decentralised Governance Protocol contracts and test suite.

# Install

Clone the repository
```
git clone https://github.com/TheLindaProjectInc/metrix-dgp.git
```
Install required pacakges
```
npm install
```
Download Metrix client from https://github.com/TheLindaProjectInc/metrix/releases and setup a metrix.conf file
```
rpcuser=user
rpcpassword=pass
txindex=1
logevents=1
```
run metrix in regtest mode
```
metrixd -regtest
```
If it is your first time running the regtest chain you will need to generate a number of blocks to fund your account. This can take some time.

Frist generate an address to fund
```
metrix-cli -regtest getnewaddress
```
the generate 1200 blocks to that address
```
metrix-cli -regtest generatetoaddress 1200 "YOURADDRESS"
```
finally make sure you account has a mature balance
```
metrix-cli -regtest getbalance
```
if your balance is 0 generate 600 some more blocks

# Running The Tests
Launch the project with the play button in VS Code or run `npm test` from the console inside the project.

Each time the tests are run the contracts will be compiled and deployed so their state will reset between each test.
