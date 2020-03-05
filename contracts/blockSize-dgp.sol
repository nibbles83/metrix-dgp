pragma solidity 0.5.8;

contract blockSize {
    uint32[1] _blockSize = [
        2000000 //block size in bytes
    ];
    function getBlockSize() public view returns (uint32[1] memory) {
        return _blockSize;
    }
}
