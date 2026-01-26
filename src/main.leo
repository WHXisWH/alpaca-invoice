// zk_invoice - For testnet deployment with Consensus V9

program zk_invoice.aleo {

    // ========== Constructor (Required for Consensus V9+) ==========
    @noupgrade
    async constructor() {}

    // ========== Status constants ==========
    const STATUS_PENDING: u8 = 0u8;
    const STATUS_PAID: u8 = 1u8;
    const STATUS_CANCELLED: u8 = 2u8;
    const STATUS_UNKNOWN: u8 = 255u8;

    // ========== Struct definitions ==========
    struct InvoiceData {
        seller: address,
        buyer: address,
        amount: u64,
        invoice_hash: field,
        due_date: u32
    }

    // ========== Record definitions ==========
    record InvoiceRecord {
        owner: address,
        invoice_id: field,
        seller: address,
        buyer: address,
        amount: u64,
        invoice_hash: field,
        due_date: u32,
        created_at: u32,
        status: u8
    }

    record PaymentRecord {
        owner: address,
        invoice_id: field,
        payer: address,
        payee: address,
        amount: u64,
        paid_at: u32
    }

    // ========== Public state ==========
    mapping invoice_status: field => u8; // invoice_id -> status

    // ========== Core Transitions (Simple version without finalize) ==========

    // Create invoice - returns records for both parties
    async transition create_invoice(
        buyer: address,
        amount: u64,
        invoice_hash: field,
        due_date: u32,
        timestamp: u32
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
            invoice_hash: invoice_hash,
            due_date: due_date
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
            due_date: due_date,
            created_at: timestamp,
            status: STATUS_PENDING
        };

        // Create buyer's record
        let buyer_record: InvoiceRecord = InvoiceRecord {
            owner: buyer,
            invoice_id: invoice_id,
            seller: seller,
            buyer: buyer,
            amount: amount,
            invoice_hash: invoice_hash,
            due_date: due_date,
            created_at: timestamp,
            status: STATUS_PENDING
        };

        return (seller_record, buyer_record, finalize_create_invoice(invoice_id));
    }

    async function finalize_create_invoice(invoice_id: field) {
        let current: u8 = Mapping::get_or_use(invoice_status, invoice_id, STATUS_UNKNOWN);
        assert_eq(current, STATUS_UNKNOWN);
        Mapping::set(invoice_status, invoice_id, STATUS_PENDING);
    }

    // Verify invoice hash matches
    transition verify_invoice_hash(
        invoice: InvoiceRecord,
        expected_hash: field
    ) -> bool {
        return invoice.invoice_hash == expected_hash;
    }

    // Mark invoice as paid - generates payment receipts
    async transition mark_as_paid(
        invoice: InvoiceRecord,
        timestamp: u32
    ) -> (PaymentRecord, PaymentRecord, InvoiceRecord, Future) {
        let buyer: address = self.caller;

        // Validation: only buyer can mark as paid
        assert_eq(buyer, invoice.buyer);

        // Validation: invoice must be pending
        assert_eq(invoice.status, STATUS_PENDING);

        // Create payment receipts
        let buyer_receipt: PaymentRecord = PaymentRecord {
            owner: buyer,
            invoice_id: invoice.invoice_id,
            payer: buyer,
            payee: invoice.seller,
            amount: invoice.amount,
            paid_at: timestamp
        };

        let seller_receipt: PaymentRecord = PaymentRecord {
            owner: invoice.seller,
            invoice_id: invoice.invoice_id,
            payer: buyer,
            payee: invoice.seller,
            amount: invoice.amount,
            paid_at: timestamp
        };

        // Update invoice status
        let updated_invoice: InvoiceRecord = InvoiceRecord {
            owner: invoice.owner,
            invoice_id: invoice.invoice_id,
            seller: invoice.seller,
            buyer: invoice.buyer,
            amount: invoice.amount,
            invoice_hash: invoice.invoice_hash,
            due_date: invoice.due_date,
            created_at: invoice.created_at,
            status: STATUS_PAID
        };

        return (buyer_receipt, seller_receipt, updated_invoice, finalize_mark_as_paid(invoice.invoice_id));
    }

    async function finalize_mark_as_paid(invoice_id: field) {
        let current: u8 = Mapping::get_or_use(invoice_status, invoice_id, STATUS_UNKNOWN);
        assert_eq(current, STATUS_PENDING);
        Mapping::set(invoice_status, invoice_id, STATUS_PAID);
    }

    // Cancel invoice - seller only
    async transition cancel_invoice(
        invoice: InvoiceRecord
    ) -> (InvoiceRecord, Future) {
        let caller: address = self.caller;

        // Validation: only seller can cancel
        assert_eq(caller, invoice.seller);

        // Validation: invoice must be pending
        assert_eq(invoice.status, STATUS_PENDING);

        // Update invoice status
        let updated_invoice: InvoiceRecord = InvoiceRecord {
            owner: invoice.owner,
            invoice_id: invoice.invoice_id,
            seller: invoice.seller,
            buyer: invoice.buyer,
            amount: invoice.amount,
            invoice_hash: invoice.invoice_hash,
            due_date: invoice.due_date,
            created_at: invoice.created_at,
            status: STATUS_CANCELLED
        };

        return (updated_invoice, finalize_cancel_invoice(invoice.invoice_id));
    }

    async function finalize_cancel_invoice(invoice_id: field) {
        let current: u8 = Mapping::get_or_use(invoice_status, invoice_id, STATUS_UNKNOWN);
        assert_eq(current, STATUS_PENDING);
        Mapping::set(invoice_status, invoice_id, STATUS_CANCELLED);
    }

    // Verify payment receipt matches invoice
    transition verify_payment(
        payment: PaymentRecord,
        invoice: InvoiceRecord
    ) -> bool {
        let matches_id: bool = payment.invoice_id == invoice.invoice_id;
        let matches_amount: bool = payment.amount == invoice.amount;
        let matches_parties: bool = (payment.payer == invoice.buyer) && (payment.payee == invoice.seller);
        
        return matches_id && matches_amount && matches_parties;
    }
}
