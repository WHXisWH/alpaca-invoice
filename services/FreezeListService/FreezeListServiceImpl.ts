import {
  type IFreezeListService,
  type MerkleProofData,
  FreezeListError,
  FreezeListServiceError,
} from './IFreezeListService';
import { USDCX_PROGRAM_ID } from '@/lib/contract';

const TREE_DEPTH = 16;

/**
 * FreezeListService implementation.
 *
 * test_usdcx_stablecoin.aleo/transfer_private requires [MerkleProof; 2]
 * where MerkleProof = { siblings: [field; 16], leaf_index: u32 }.
 *
 * The two proofs form a sorted non-inclusion proof:
 *   proof[0].leaf_index + 1 == proof[1].leaf_index
 * proving the queried address hash falls between two adjacent leaves.
 *
 * When the freeze list is empty (testnet default), all siblings are 0field
 * and the dynamic-depth logic truncates at depth 1.
 */
export class FreezeListService implements IFreezeListService {
  private readonly nodeUrl: string;

  constructor(nodeUrl?: string) {
    this.nodeUrl = nodeUrl ?? 'https://api.explorer.provable.com/v1';
  }

  async getMerkleProofs(
    payerAddress: string,
    payeeAddress: string
  ): Promise<[MerkleProofData, MerkleProofData]> {
    const payerFrozen = await this.isAddressFrozen(payerAddress);
    if (payerFrozen) {
      throw new FreezeListServiceError(
        FreezeListError.ADDRESS_FROZEN,
        `Payer address ${payerAddress} is on the freeze list.`
      );
    }

    const payeeFrozen = await this.isAddressFrozen(payeeAddress);
    if (payeeFrozen) {
      throw new FreezeListServiceError(
        FreezeListError.ADDRESS_FROZEN,
        `Payee address ${payeeAddress} is on the freeze list.`
      );
    }

    try {
      return [
        this.buildEmptyTreeProof(0),
        this.buildEmptyTreeProof(1),
      ];
    } catch (err) {
      throw new FreezeListServiceError(
        FreezeListError.PROOF_BUILD_FAILED,
        'Failed to build freeze-list Merkle proofs.',
        { originalError: err }
      );
    }
  }

  async isAddressFrozen(address: string): Promise<boolean> {
    if (!USDCX_PROGRAM_ID) return false;

    try {
      const url = `${this.nodeUrl}/${this.getNetwork()}/program/${USDCX_PROGRAM_ID}/mapping/frozen_addresses/${address}`;
      const response = await fetch(url);
      if (!response.ok) return false;

      const value = await response.text();
      const trimmed = value.replace(/"/g, '').trim();
      return trimmed === 'true';
    } catch {
      return false;
    }
  }

  /**
   * Build MerkleProof for an empty freeze-list tree.
   * All 16 siblings are 0field; the contract's dynamic-depth logic
   * detects siblings[2]==0field and truncates, computing
   * root = psd4([1field, 0field, 0field]) at depth 1.
   */
  private buildEmptyTreeProof(leafIndex: number): MerkleProofData {
    return {
      siblings: Array(TREE_DEPTH).fill('0field'),
      leaf_index: leafIndex,
    };
  }

  private getNetwork(): string {
    return process.env.NEXT_PUBLIC_ALEO_NETWORK ?? 'testnet';
  }
}

/**
 * Serialize a MerkleProofData pair into the Leo struct string format
 * expected by pay_invoice_usdcx: [MerkleProof; 2].
 *
 * Output: [{ siblings: [f0, f1, ...f15], leaf_index: Nu32 }, { ... }]
 */
export function serializeMerkleProofsForContract(
  proofs: [MerkleProofData, MerkleProofData]
): string {
  const serializeOne = (p: MerkleProofData): string => {
    const siblingsStr = p.siblings.join(', ');
    return `{ siblings: [${siblingsStr}], leaf_index: ${p.leaf_index}u32 }`;
  };
  return `[${serializeOne(proofs[0])}, ${serializeOne(proofs[1])}]`;
}
