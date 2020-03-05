pragma solidity 0.5.8;

contract minGasPrice {
    uint32[1] _minGasPrice = [
        1 //min gas price in satoshis
    ];
    function getMinGasPrice() public view returns (uint32[1] memory) {
        return _minGasPrice;
    }
}
