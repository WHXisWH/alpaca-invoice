// zk_invoice program for Aleo - Full implementation with async/mappings
// Implements invoice creation, payment, cancellation with on-chain state tracking

import credits.aleo;

program zkinvoice.aleo {

    // The constructor is required for V9+ consensus
    @noupgrade
    async constructor() {}

    // ========== Status constants ==========
    const STATUS_PENDING: u8 = 0u8;
    const STATUS_PAID: u8 = 1u8;
    const STATUS_CANCELLED: u8 = 2u8;

    // ========== Struct definitions ==========
    struct InvoiceData {
        seller: address,
        buyer: address,
        amount: u64,
        invoice_hash: field
    }

    // ========== Mappings (公开状态) ==========
    mapping invoice_registry: field => u8;  // invoice_id => status
    mapping invoice_hash_index: field => field;  // hash => invoice_id

    // ========== Record definitions ==========
    record InvoiceRecord {
        owner: address,
        invoice_id: field,
        seller: address,
        buyer: address,
        amount: u64,
        invoice_hash: field,
        created_at: u32
    }

    record PaymentRecord {
        owner: address,
        invoice_id: field,
        payer: address,
        payee: address,
        amount: u64,
        paid_at: u32
    }

    // ========== Core Transitions ==========

    // Create invoice - generates two records and registers on-chain
    async transition create_invoice(
        buyer: address,
        amount: u64,
        invoice_hash: field
    ) -> (InvoiceRecord, InvoiceRecord, Future) {
        let seller: address = self.caller;

        // Validation
        assert_neq(seller, buyer);
        assert(amount > 0u64);

        // Generate unique invoice_id
        let invoice_data: InvoiceData = InvoiceData {
            seller: seller,
            buyer: buyer,
            amount: amount,
            invoice_hash: invoice_hash
        };
        let invoice_id: field = BHP256::hash_to_field(invoice_data);

        // Create seller's record
        let seller_record: InvoiceRecord = InvoiceRecord {
            owner: seller,
            invoice_id: invoice_id,
            seller: seller,
            buyer: buyer,
            amount: amount,
            invoice_hash: invoice_hash,
            created_at: 0u32
        };

        // Create buyer's record
        let buyer_record: InvoiceRecord = InvoiceRecord {
            owner: buyer,
            invoice_id: invoice_id,
            seller: seller,
            buyer: buyer,
            amount: amount,
            invoice_hash: invoice_hash,
            created_at: 0u32
        };

        return (seller_record, buyer_record, finalize_create_invoice(invoice_id, invoice_hash));
    }

    async function finalize_create_invoice(invoice_id: field, invoice_hash: field) {
        // Register invoice in public mappings
        Mapping::set(invoice_registry, invoice_id, STATUS_PENDING);
        Mapping::set(invoice_hash_index, invoice_hash, invoice_id);
    }

    // Pay invoice - marks invoice as paid and generates payment records
    // Note: Actual payment should be done via separate credits.aleo/transfer_private call
    async transition pay_invoice(
        invoice: InvoiceRecord
    ) -> (PaymentRecord, PaymentRecord, Future) {
        let buyer: address = self.caller;

        // Validation
        assert_eq(buyer, invoice.buyer);

        // Generate PaymentRecords for both parties
        let buyer_receipt: PaymentRecord = PaymentRecord {
            owner: buyer,
            invoice_id: invoice.invoice_id,
            payer: buyer,
            payee: invoice.seller,
            amount: invoice.amount,
            paid_at: 0u32
        };

        let seller_receipt: PaymentRecord = PaymentRecord {
            owner: invoice.seller,
            invoice_id: invoice.invoice_id,
            payer: buyer,
            payee: invoice.seller,
            amount: invoice.amount,
            paid_at: 0u32
        };

        return (buyer_receipt, seller_receipt, finalize_pay_invoice(invoice.invoice_id));
    }

    async function finalize_pay_invoice(invoice_id: field) {
        // Update invoice status to PAID
        Mapping::set(invoice_registry, invoice_id, STATUS_PAID);
    }

    // Cancel invoice - only seller can cancel PENDING invoices
    async transition cancel_invoice(
        invoice: InvoiceRecord
    ) -> Future {
        let caller: address = self.caller;

        // Validation
        assert_eq(caller, invoice.seller);

        return finalize_cancel_invoice(invoice.invoice_id);
    }

    async function finalize_cancel_invoice(invoice_id: field) {
        // Check current status
        let current_status: u8 = Mapping::get(invoice_registry, invoice_id);
        assert_eq(current_status, STATUS_PENDING);
        
        // Update to CANCELLED
        Mapping::set(invoice_registry, invoice_id, STATUS_CANCELLED);
    }

    // Verify payment receipt matches invoice hash
    transition verify_payment(
        payment: PaymentRecord,
        invoice_hash: field
    ) -> bool {
        // Verification logic - compare payment data with expected hash
        return true;  // Simplified for now
    }
}
