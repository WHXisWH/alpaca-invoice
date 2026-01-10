// Comprehensive test suite for zk_invoice.aleo
// This file contains all test cases for the invoice management system

import zk_invoice.aleo;

program test_zk_invoice.aleo {

    // ========== Test Constants ==========
    const TEST_SELLER: address = aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc;
    const TEST_BUYER: address = aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqk9svjc;
    const TEST_AMOUNT: u64 = 1000000u64;
    const TEST_DUE_DATE: u32 = 1735689600u32; // 2025-01-01
    const TEST_INVOICE_HASH: field = 123456789field;
    const TEST_NONCE: field = 99999field;
    const TEST_PAYMENT_NONCE: field = 88888field;

    // ========== Test Case 1: Create Invoice - Happy Path ==========
    // Tests the successful creation of an invoice with valid parameters
    transition test_create_invoice_success() -> bool {
        // Call create_invoice as seller
        let (seller_record, buyer_record): (InvoiceRecord, InvoiceRecord) =
            zk_invoice.aleo/create_invoice(
                TEST_BUYER,
                TEST_AMOUNT,
                TEST_DUE_DATE,
                TEST_INVOICE_HASH,
                TEST_NONCE
            );

        // Verify seller_record fields
        let seller_check: bool =
            seller_record.seller == TEST_SELLER &&
            seller_record.buyer == TEST_BUYER &&
            seller_record.amount == TEST_AMOUNT &&
            seller_record.due_date == TEST_DUE_DATE &&
            seller_record.invoice_hash == TEST_INVOICE_HASH &&
            seller_record.status == 0u8;  // STATUS_PENDING

        // Verify buyer_record fields
        let buyer_check: bool =
            buyer_record.owner == TEST_BUYER &&
            buyer_record.seller == TEST_SELLER &&
            buyer_record.buyer == TEST_BUYER &&
            buyer_record.amount == TEST_AMOUNT &&
            buyer_record.status == 0u8;  // STATUS_PENDING

        // Verify both records have the same invoice_id
        let id_match: bool = seller_record.invoice_id == buyer_record.invoice_id;

        return seller_check && buyer_check && id_match;
    }

    // ========== Test Case 2: Create Invoice with Different Amounts ==========
    // Tests invoice creation with various amount values
    transition test_create_invoice_different_amounts(amount: u64) -> bool {
        // Ensure amount is positive
        assert(amount > 0u64);

        let (seller_record, buyer_record): (InvoiceRecord, InvoiceRecord) =
            zk_invoice.aleo/create_invoice(
                TEST_BUYER,
                amount,
                TEST_DUE_DATE,
                TEST_INVOICE_HASH,
                TEST_NONCE
            );

        return seller_record.amount == amount && buyer_record.amount == amount;
    }

    // ========== Test Case 3: Create Invoice with Different Buyers ==========
    // Tests that invoices with different buyers generate different IDs
    transition test_create_invoice_different_buyers(
        buyer1: address,
        buyer2: address
    ) -> bool {
        // Ensure buyers are different
        assert_neq(buyer1, buyer2);

        let (seller_record1, _): (InvoiceRecord, InvoiceRecord) =
            zk_invoice.aleo/create_invoice(
                buyer1,
                TEST_AMOUNT,
                TEST_DUE_DATE,
                TEST_INVOICE_HASH,
                TEST_NONCE
            );

        let (seller_record2, _): (InvoiceRecord, InvoiceRecord) =
            zk_invoice.aleo/create_invoice(
                buyer2,
                TEST_AMOUNT,
                TEST_DUE_DATE,
                TEST_INVOICE_HASH,
                TEST_NONCE + 1field  // Different nonce to ensure different ID
            );

        // Invoice IDs should be different
        return seller_record1.invoice_id != seller_record2.invoice_id;
    }

    // ========== Test Case 4: Create Invoice with Different Nonces ==========
    // Tests that different nonces generate different invoice IDs
    transition test_create_invoice_different_nonces() -> bool {
        let (record1, _): (InvoiceRecord, InvoiceRecord) =
            zk_invoice.aleo/create_invoice(
                TEST_BUYER,
                TEST_AMOUNT,
                TEST_DUE_DATE,
                TEST_INVOICE_HASH,
                1field
            );

        let (record2, _): (InvoiceRecord, InvoiceRecord) =
            zk_invoice.aleo/create_invoice(
                TEST_BUYER,
                TEST_AMOUNT,
                TEST_DUE_DATE,
                TEST_INVOICE_HASH,
                2field
            );

        // Different nonces should produce different invoice_ids
        return record1.invoice_id != record2.invoice_id;
    }

    // ========== Test Case 5: Verify Invoice - Match Hash ==========
    // Tests successful invoice hash verification
    transition test_verify_invoice_match() -> bool {
        let (seller_record, _): (InvoiceRecord, InvoiceRecord) =
            zk_invoice.aleo/create_invoice(
                TEST_BUYER,
                TEST_AMOUNT,
                TEST_DUE_DATE,
                TEST_INVOICE_HASH,
                TEST_NONCE
            );

        let is_valid: bool = zk_invoice.aleo/verify_invoice(
            seller_record,
            TEST_INVOICE_HASH
        );

        return is_valid;
    }

    // ========== Test Case 6: Verify Invoice - Mismatch Hash ==========
    // Tests invoice verification failure with wrong hash
    transition test_verify_invoice_mismatch() -> bool {
        let (seller_record, _): (InvoiceRecord, InvoiceRecord) =
            zk_invoice.aleo/create_invoice(
                TEST_BUYER,
                TEST_AMOUNT,
                TEST_DUE_DATE,
                TEST_INVOICE_HASH,
                TEST_NONCE
            );

        let wrong_hash: field = TEST_INVOICE_HASH + 1field;
        let is_valid: bool = zk_invoice.aleo/verify_invoice(
            seller_record,
            wrong_hash
        );

        // Should return false for mismatched hash
        return !is_valid;
    }

    // ========== Test Case 7: Mark Invoice as Paid - Success ==========
    // Tests successful payment marking by buyer
    transition test_mark_as_paid_success() -> bool {
        // First create an invoice
        let (_, buyer_record): (InvoiceRecord, InvoiceRecord) =
            zk_invoice.aleo/create_invoice(
                TEST_BUYER,
                TEST_AMOUNT,
                TEST_DUE_DATE,
                TEST_INVOICE_HASH,
                TEST_NONCE
            );

        // Mark as paid (caller must be buyer)
        let (receipt, updated_invoice): (PaymentRecord, InvoiceRecord) =
            zk_invoice.aleo/mark_as_paid(
                buyer_record,
                TEST_PAYMENT_NONCE
            );

        // Verify payment receipt fields
        let receipt_check: bool =
            receipt.owner == TEST_BUYER &&
            receipt.invoice_id == buyer_record.invoice_id &&
            receipt.payer == TEST_BUYER &&
            receipt.payee == TEST_SELLER &&
            receipt.amount == TEST_AMOUNT;

        // Verify invoice status updated to PAID
        let status_check: bool = updated_invoice.status == 1u8;  // STATUS_PAID

        return receipt_check && status_check;
    }

    // ========== Test Case 8: Create Seller Receipt ==========
    // Tests seller receipt creation after payment
    transition test_create_seller_receipt() -> bool {
        // First create invoice and mark as paid
        let (_, buyer_record): (InvoiceRecord, InvoiceRecord) =
            zk_invoice.aleo/create_invoice(
                TEST_BUYER,
                TEST_AMOUNT,
                TEST_DUE_DATE,
                TEST_INVOICE_HASH,
                TEST_NONCE
            );

        let (buyer_receipt, _): (PaymentRecord, InvoiceRecord) =
            zk_invoice.aleo/mark_as_paid(
                buyer_record,
                TEST_PAYMENT_NONCE
            );

        // Seller creates their receipt
        let seller_receipt: PaymentRecord =
            zk_invoice.aleo/create_seller_receipt(
                buyer_receipt.invoice_id,
                TEST_BUYER,
                TEST_SELLER,
                TEST_AMOUNT,
                TEST_PAYMENT_NONCE
            );

        // Verify seller receipt fields
        let receipt_check: bool =
            seller_receipt.owner == TEST_SELLER &&
            seller_receipt.invoice_id == buyer_receipt.invoice_id &&
            seller_receipt.payer == TEST_BUYER &&
            seller_receipt.payee == TEST_SELLER &&
            seller_receipt.amount == TEST_AMOUNT;

        // Verify payment IDs match (same hash inputs)
        let id_match: bool = seller_receipt.payment_id == buyer_receipt.payment_id;

        return receipt_check && id_match;
    }

    // ========== Test Case 9: Cancel Invoice - Success ==========
    // Tests successful invoice cancellation by seller
    transition test_cancel_invoice_success() -> bool {
        // Create an invoice
        let (seller_record, _): (InvoiceRecord, InvoiceRecord) =
            zk_invoice.aleo/create_invoice(
                TEST_BUYER,
                TEST_AMOUNT,
                TEST_DUE_DATE,
                TEST_INVOICE_HASH,
                TEST_NONCE
            );

        // Cancel invoice (caller must be seller)
        let cancelled_invoice: InvoiceRecord =
            zk_invoice.aleo/cancel_invoice(seller_record);

        // Verify status changed to CANCELLED
        let status_check: bool = cancelled_invoice.status == 2u8;  // STATUS_CANCELLED

        // Verify other fields remain unchanged
        let fields_check: bool =
            cancelled_invoice.invoice_id == seller_record.invoice_id &&
            cancelled_invoice.seller == seller_record.seller &&
            cancelled_invoice.buyer == seller_record.buyer &&
            cancelled_invoice.amount == seller_record.amount;

        return status_check && fields_check;
    }

    // ========== Test Case 10: Verify Payment - Match ==========
    // Tests successful payment verification
    transition test_verify_payment_match() -> bool {
        // Create invoice and mark as paid
        let (_, buyer_record): (InvoiceRecord, InvoiceRecord) =
            zk_invoice.aleo/create_invoice(
                TEST_BUYER,
                TEST_AMOUNT,
                TEST_DUE_DATE,
                TEST_INVOICE_HASH,
                TEST_NONCE
            );

        let (receipt, updated_invoice): (PaymentRecord, InvoiceRecord) =
            zk_invoice.aleo/mark_as_paid(
                buyer_record,
                TEST_PAYMENT_NONCE
            );

        // Verify payment matches invoice
        let is_valid: bool = zk_invoice.aleo/verify_payment(
            receipt,
            updated_invoice
        );

        return is_valid;
    }

    // ========== Test Case 11: Verify Payment - Wrong Invoice ==========
    // Tests payment verification failure with mismatched invoice
    transition test_verify_payment_mismatch() -> bool {
        // Create two invoices
        let (_, buyer_record1): (InvoiceRecord, InvoiceRecord) =
            zk_invoice.aleo/create_invoice(
                TEST_BUYER,
                TEST_AMOUNT,
                TEST_DUE_DATE,
                TEST_INVOICE_HASH,
                1field
            );

        let (_, buyer_record2): (InvoiceRecord, InvoiceRecord) =
            zk_invoice.aleo/create_invoice(
                TEST_BUYER,
                TEST_AMOUNT + 100u64,
                TEST_DUE_DATE,
                TEST_INVOICE_HASH,
                2field
            );

        // Mark first invoice as paid
        let (receipt1, _): (PaymentRecord, InvoiceRecord) =
            zk_invoice.aleo/mark_as_paid(
                buyer_record1,
                TEST_PAYMENT_NONCE
            );

        // Try to verify with second invoice (should fail)
        let is_valid: bool = zk_invoice.aleo/verify_payment(
            receipt1,
            buyer_record2
        );

        // Should return false for mismatched invoice
        return !is_valid;
    }

    // ========== Test Case 12: Complete Workflow Test ==========
    // Tests the complete invoice lifecycle from creation to payment
    transition test_complete_workflow() -> bool {
        // Step 1: Seller creates invoice
        let (seller_invoice, buyer_invoice): (InvoiceRecord, InvoiceRecord) =
            zk_invoice.aleo/create_invoice(
                TEST_BUYER,
                TEST_AMOUNT,
                TEST_DUE_DATE,
                TEST_INVOICE_HASH,
                TEST_NONCE
            );

        // Step 2: Buyer verifies invoice hash
        let is_valid_invoice: bool = zk_invoice.aleo/verify_invoice(
            buyer_invoice,
            TEST_INVOICE_HASH
        );

        // Step 3: Buyer marks invoice as paid
        let (buyer_receipt, paid_invoice): (PaymentRecord, InvoiceRecord) =
            zk_invoice.aleo/mark_as_paid(
                buyer_invoice,
                TEST_PAYMENT_NONCE
            );

        // Step 4: Seller creates their receipt
        let seller_receipt: PaymentRecord =
            zk_invoice.aleo/create_seller_receipt(
                paid_invoice.invoice_id,
                TEST_BUYER,
                TEST_SELLER,
                TEST_AMOUNT,
                TEST_PAYMENT_NONCE
            );

        // Step 5: Verify payment matches invoice
        let is_valid_payment: bool = zk_invoice.aleo/verify_payment(
            buyer_receipt,
            paid_invoice
        );

        // Verify entire workflow
        let workflow_check: bool =
            is_valid_invoice &&
            paid_invoice.status == 1u8 &&  // STATUS_PAID
            buyer_receipt.payment_id == seller_receipt.payment_id &&
            is_valid_payment;

        return workflow_check;
    }

    // ========== Test Case 13: Multiple Invoices Test ==========
    // Tests creating and managing multiple invoices
    transition test_multiple_invoices() -> bool {
        // Create first invoice
        let (invoice1, _): (InvoiceRecord, InvoiceRecord) =
            zk_invoice.aleo/create_invoice(
                TEST_BUYER,
                1000u64,
                TEST_DUE_DATE,
                TEST_INVOICE_HASH,
                1field
            );

        // Create second invoice
        let (invoice2, _): (InvoiceRecord, InvoiceRecord) =
            zk_invoice.aleo/create_invoice(
                TEST_BUYER,
                2000u64,
                TEST_DUE_DATE + 86400u32,
                TEST_INVOICE_HASH + 1field,
                2field
            );

        // Create third invoice
        let (invoice3, _): (InvoiceRecord, InvoiceRecord) =
            zk_invoice.aleo/create_invoice(
                TEST_BUYER,
                3000u64,
                TEST_DUE_DATE + 172800u32,
                TEST_INVOICE_HASH + 2field,
                3field
            );

        // Verify all invoices have unique IDs
        let unique_ids: bool =
            invoice1.invoice_id != invoice2.invoice_id &&
            invoice2.invoice_id != invoice3.invoice_id &&
            invoice1.invoice_id != invoice3.invoice_id;

        // Verify amounts are correct
        let amounts_check: bool =
            invoice1.amount == 1000u64 &&
            invoice2.amount == 2000u64 &&
            invoice3.amount == 3000u64;

        return unique_ids && amounts_check;
    }

    // ========== Test Case 14: Edge Case - Maximum Amount ==========
    // Tests invoice with maximum u64 value
    transition test_max_amount() -> bool {
        let max_amount: u64 = 18446744073709551615u64;  // Max u64

        let (seller_record, buyer_record): (InvoiceRecord, InvoiceRecord) =
            zk_invoice.aleo/create_invoice(
                TEST_BUYER,
                max_amount,
                TEST_DUE_DATE,
                TEST_INVOICE_HASH,
                TEST_NONCE
            );

        return seller_record.amount == max_amount &&
               buyer_record.amount == max_amount;
    }

    // ========== Test Case 15: Edge Case - Minimum Amount ==========
    // Tests invoice with minimum valid amount (1)
    transition test_min_amount() -> bool {
        let min_amount: u64 = 1u64;

        let (seller_record, buyer_record): (InvoiceRecord, InvoiceRecord) =
            zk_invoice.aleo/create_invoice(
                TEST_BUYER,
                min_amount,
                TEST_DUE_DATE,
                TEST_INVOICE_HASH,
                TEST_NONCE
            );

        return seller_record.amount == min_amount &&
               buyer_record.amount == min_amount;
    }

    // ========== Test Case 16: Invoice Status Progression ==========
    // Tests that invoice status progresses correctly through lifecycle
    transition test_status_progression() -> bool {
        // Create invoice (PENDING)
        let (_, buyer_record): (InvoiceRecord, InvoiceRecord) =
            zk_invoice.aleo/create_invoice(
                TEST_BUYER,
                TEST_AMOUNT,
                TEST_DUE_DATE,
                TEST_INVOICE_HASH,
                TEST_NONCE
            );
        let is_pending: bool = buyer_record.status == 0u8;

        // Mark as paid (PAID)
        let (_, paid_invoice): (PaymentRecord, InvoiceRecord) =
            zk_invoice.aleo/mark_as_paid(
                buyer_record,
                TEST_PAYMENT_NONCE
            );
        let is_paid: bool = paid_invoice.status == 1u8;

        return is_pending && is_paid;
    }

    // ========== Test Case 17: Invoice Cancellation Workflow ==========
    // Tests the cancellation workflow
    transition test_cancellation_workflow() -> bool {
        // Create invoice
        let (seller_invoice, _): (InvoiceRecord, InvoiceRecord) =
            zk_invoice.aleo/create_invoice(
                TEST_BUYER,
                TEST_AMOUNT,
                TEST_DUE_DATE,
                TEST_INVOICE_HASH,
                TEST_NONCE
            );

        // Verify initial status is PENDING
        let is_pending: bool = seller_invoice.status == 0u8;

        // Cancel invoice
        let cancelled_invoice: InvoiceRecord =
            zk_invoice.aleo/cancel_invoice(seller_invoice);

        // Verify status changed to CANCELLED
        let is_cancelled: bool = cancelled_invoice.status == 2u8;

        // Verify invoice_id remains the same
        let id_unchanged: bool =
            cancelled_invoice.invoice_id == seller_invoice.invoice_id;

        return is_pending && is_cancelled && id_unchanged;
    }

    // ========== Test Case 18: Payment ID Consistency ==========
    // Tests that buyer and seller receipts have matching payment IDs
    transition test_payment_id_consistency() -> bool {
        // Create invoice
        let (_, buyer_invoice): (InvoiceRecord, InvoiceRecord) =
            zk_invoice.aleo/create_invoice(
                TEST_BUYER,
                TEST_AMOUNT,
                TEST_DUE_DATE,
                TEST_INVOICE_HASH,
                TEST_NONCE
            );

        // Buyer marks as paid
        let (buyer_receipt, _): (PaymentRecord, InvoiceRecord) =
            zk_invoice.aleo/mark_as_paid(
                buyer_invoice,
                TEST_PAYMENT_NONCE
            );

        // Seller creates receipt with same parameters
        let seller_receipt: PaymentRecord =
            zk_invoice.aleo/create_seller_receipt(
                buyer_invoice.invoice_id,
                TEST_BUYER,
                TEST_SELLER,
                TEST_AMOUNT,
                TEST_PAYMENT_NONCE
            );

        // Payment IDs should match
        return buyer_receipt.payment_id == seller_receipt.payment_id;
    }

    // ========== Test Case 19: Different Payment Nonces ==========
    // Tests that different payment nonces generate different payment IDs
    transition test_different_payment_nonces() -> bool {
        // Create invoice
        let (_, buyer_invoice): (InvoiceRecord, InvoiceRecord) =
            zk_invoice.aleo/create_invoice(
                TEST_BUYER,
                TEST_AMOUNT,
                TEST_DUE_DATE,
                TEST_INVOICE_HASH,
                TEST_NONCE
            );

        // Mark as paid with first nonce
        let (receipt1, _): (PaymentRecord, InvoiceRecord) =
            zk_invoice.aleo/mark_as_paid(
                buyer_invoice,
                1field
            );

        // Create another invoice
        let (_, buyer_invoice2): (InvoiceRecord, InvoiceRecord) =
            zk_invoice.aleo/create_invoice(
                TEST_BUYER,
                TEST_AMOUNT,
                TEST_DUE_DATE,
                TEST_INVOICE_HASH,
                TEST_NONCE + 1field
            );

        // Mark as paid with second nonce
        let (receipt2, _): (PaymentRecord, InvoiceRecord) =
            zk_invoice.aleo/mark_as_paid(
                buyer_invoice2,
                2field
            );

        // Payment IDs should be different
        return receipt1.payment_id != receipt2.payment_id;
    }

    // ========== Test Case 20: Verify Invoice Fields Immutability ==========
    // Tests that core invoice fields remain unchanged after operations
    transition test_invoice_immutability() -> bool {
        // Create invoice
        let (seller_invoice, buyer_invoice): (InvoiceRecord, InvoiceRecord) =
            zk_invoice.aleo/create_invoice(
                TEST_BUYER,
                TEST_AMOUNT,
                TEST_DUE_DATE,
                TEST_INVOICE_HASH,
                TEST_NONCE
            );

        // Store original values
        let original_id: field = buyer_invoice.invoice_id;
        let original_amount: u64 = buyer_invoice.amount;
        let original_seller: address = buyer_invoice.seller;
        let original_buyer: address = buyer_invoice.buyer;

        // Mark as paid
        let (_, paid_invoice): (PaymentRecord, InvoiceRecord) =
            zk_invoice.aleo/mark_as_paid(
                buyer_invoice,
                TEST_PAYMENT_NONCE
            );

        // Verify core fields unchanged (only status should change)
        let fields_unchanged: bool =
            paid_invoice.invoice_id == original_id &&
            paid_invoice.amount == original_amount &&
            paid_invoice.seller == original_seller &&
            paid_invoice.buyer == original_buyer;

        // Verify only status changed
        let status_changed: bool = paid_invoice.status != buyer_invoice.status;

        return fields_unchanged && status_changed;
    }
}
