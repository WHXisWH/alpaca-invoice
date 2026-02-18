import { create } from 'zustand';
import { InvoiceState, ChainConfirmationStatus } from './InvoiceState';
import { Invoice, AleoField, AleoAddress, EncryptedPayload, InvoiceStatus } from '@/lib/types';
import { StorageService } from '@/services/StorageService/StorageServiceImpl';
import { CryptoService } from '@/services/CryptoService/CryptoServiceImpl';

// Service instances (singleton pattern, lazy initialization)
let storageServiceInstance: StorageService | null = null;
let cryptoServiceInstance: CryptoService | null = null;

const getStorageService = (): StorageService => {
  if (!storageServiceInstance) {
    storageServiceInstance = new StorageService();
  }
  return storageServiceInstance;
};

const getCryptoService = (): CryptoService => {
  if (!cryptoServiceInstance) {
    cryptoServiceInstance = new CryptoService();
  }
  return cryptoServiceInstance;
};

// Table name constant
const INVOICE_TABLE = 'invoices';

/**
 * Invoice storage data structure (format stored in IndexedDB)
 * Directly uses Invoice's basic fields without nesting in basicInfo
 */
interface InvoiceStorageData {
  // Invoice basic fields
  id: AleoField;
  invoiceHash: AleoField;
  seller: AleoAddress;
  buyer: AleoAddress;
  amount: bigint;
  dueDate: Date;
  createdAt: Date;
  status: InvoiceStatus;
  nonce?: AleoField;
  auditKey?: string;
  // Encrypted details
  encryptedDetails: EncryptedPayload | null;
  // Metadata
  metadata: {
    confirmationStatus: ChainConfirmationStatus;
    lastUpdated: Date;
    dataSource: 'local' | 'chain';
    action?: 'create' | 'cancel' | 'pay'; // Identifies the current action type
  };
}

/**
 * Invoice Store implementation
 * All methods interact directly with IndexedDB (using the generic storage interface)
 */
export const useInvoiceStore = create<InvoiceState>((set, get) => ({
  // Initial state
  invoices: [],
  currentInvoice: null,  // Currently selected invoice
  sendingInvoiceHashes: {},  // Global SENDING index
  chainStatusCache: {},

  /**
   * Add invoice: receive invoice -> save to IndexedDB -> update memory
   */
  addInvoice: async (invoice, options = {}) => {
    const { masterKey, persistFull = true } = options;

    // 1. Persist full invoice information to IndexedDB (if enabled)
    if (persistFull && masterKey) {
      try {
        // Encrypt details (if present)
        const encryptedDetails = invoice.details
          ? await getCryptoService().encryptPayload(invoice.details, masterKey)
          : null;

        // Build storage data (directly using Invoice's basic fields)
        const storageData: InvoiceStorageData = {
          id: invoice.id,
          invoiceHash: invoice.invoiceHash,
          seller: invoice.seller,
          buyer: invoice.buyer,
          amount: invoice.amount,
          dueDate: invoice.dueDate,
          createdAt: invoice.createdAt,
          status: invoice.status,
          nonce: invoice.nonce,
          auditKey: invoice.auditKey,
          encryptedDetails: encryptedDetails,
          metadata: {
            confirmationStatus: 'SENDING',
            lastUpdated: new Date(),
            dataSource: 'local'
          }
        };

        // Use generic storage interface (using invoiceId as key)
        await getStorageService().addData(INVOICE_TABLE, invoice.id, storageData);

        console.log('[Store.addInvoice] Persisted full invoice to IndexedDB:', invoice.invoiceHash);
      } catch (error) {
        console.error('[Store.addInvoice] Failed to persist:', error);
        // Throw error on persistence failure, do not update memory, keep DB and memory in sync
        throw error;
      }
    }

    // 2. Update memory state (only when persistence succeeds or is not required)
    // Ensure invoice includes metadata (if missing, add default values)
    const invoiceWithMetadata = invoice.metadata ? invoice : {
      ...invoice,
      metadata: {
        confirmationStatus: 'SENDING' as ChainConfirmationStatus,
        lastUpdated: new Date(),
        dataSource: 'local' as const
      }
    };

    set((state) => {
      // If in SENDING status, also update the sending index
      const newSending = invoiceWithMetadata.metadata?.confirmationStatus === 'SENDING'
        ? { ...state.sendingInvoiceHashes, [invoiceWithMetadata.invoiceHash]: true as const }
        : state.sendingInvoiceHashes;

      return {
        invoices: [...state.invoices, invoiceWithMetadata],
        sendingInvoiceHashes: newSending
      };
    });
  },

  /**
   * Update invoice: receive updates -> save to IndexedDB -> update memory
   */
  updateInvoice: async (id, updates, options = {}) => {
    const { masterKey, persistFull = true } = options;
    const state = get();

    // Prefer using currentInvoice (if it exists and matches), otherwise search in invoices
    // Also check both id and invoiceHash (to handle key migration cases)
    const updatesInvoiceHash = (updates as any).invoiceHash;

    let currentInvoice =
      (state.currentInvoice?.id === id ||
       (updatesInvoiceHash && state.currentInvoice?.invoiceHash === updatesInvoiceHash))
        ? state.currentInvoice
        : state.invoices.find(inv =>
            inv.id === id ||
            (updatesInvoiceHash && inv.invoiceHash === updatesInvoiceHash)
          );

    if (!currentInvoice) {
      console.warn('[Store.updateInvoice] Invoice not found:', id, {
        updateInvoiceHash: updatesInvoiceHash,
        availableInvoiceIds: state.invoices.map(inv => inv.id).slice(0, 5)
      });
      return;
    }

    console.log('[Store.updateInvoice] Found invoice:', {
      searchId: id,
      foundById: currentInvoice.id === id,
      foundByHash: updatesInvoiceHash && currentInvoice.invoiceHash === updatesInvoiceHash,
      currentId: currentInvoice.id,
      invoiceHash: currentInvoice.invoiceHash
    });

    // Correctly merge metadata (if updates contain metadata, use it; otherwise keep existing)
    const updatedInvoice = {
      ...currentInvoice,
      ...updates,
      // Ensure metadata is correctly merged: if updates contain metadata, use it; otherwise keep currentInvoice's metadata
      metadata: (updates as any).metadata || currentInvoice.metadata
    };

    // 1. Synchronously update IndexedDB
    if (persistFull && masterKey) {
      try {
        // Try to find existing record: first use the provided id, if not found try adding .private suffix
        let existing = await getStorageService().getData<InvoiceStorageData>(
          INVOICE_TABLE,
          id
        );

        // If not found, try using id with .private suffix
        let dbKey = id;
        if (!existing && !id.endsWith('.private')) {
          const idWithPrivate = `${id}.private` as AleoField;
          existing = await getStorageService().getData<InvoiceStorageData>(
            INVOICE_TABLE,
            idWithPrivate
          );

          // If found, update dbKey to the version with .private suffix for subsequent update operations
          if (existing) {
            dbKey = idWithPrivate;
            console.log('[Store.updateInvoice] Found record with .private suffix, using:', dbKey);
          }
        }

        if (!existing) {
          console.warn('[Store.updateInvoice] Invoice not found in IndexedDB:', id);
          return;
        }

        // Encrypt updated details (if present)
        const encryptedDetails = updatedInvoice.details
          ? await getCryptoService().encryptPayload(updatedInvoice.details, masterKey)
          : existing.encryptedDetails;

        // Build update data (directly using Invoice's basic fields)
        // Use updatedInvoice.metadata (already correctly merged), fall back to existing.metadata if absent
        const finalMetadata = updatedInvoice.metadata || existing.metadata;
        const storageUpdates: Partial<InvoiceStorageData> = {
          id: updatedInvoice.id,
          invoiceHash: updatedInvoice.invoiceHash,
          seller: updatedInvoice.seller,
          buyer: updatedInvoice.buyer,
          amount: updatedInvoice.amount,
          dueDate: updatedInvoice.dueDate,
          createdAt: updatedInvoice.createdAt,
          status: updatedInvoice.status,
          ...(updatedInvoice.nonce !== undefined && { nonce: updatedInvoice.nonce }),
          ...(updatedInvoice.auditKey !== undefined && { auditKey: updatedInvoice.auditKey }),
          encryptedDetails: encryptedDetails,
          metadata: {
            confirmationStatus: finalMetadata.confirmationStatus,
            lastUpdated: new Date(),
            dataSource: finalMetadata.dataSource
          }
        };

        // Use generic storage interface to update (using the correct dbKey, which may have .private suffix)
        await getStorageService().updateData(INVOICE_TABLE, dbKey, storageUpdates);

        console.log('[Store.updateInvoice] Updated in IndexedDB:', dbKey);
      } catch (error) {
        console.error('[Store.updateInvoice] Failed to update IndexedDB:', error);
        // Throw error on persistence failure, do not update memory, keep DB and memory in sync
        throw error;
      }
    }

    // 2. Update memory (only when persistence succeeds or is not required)
    set((state) => {
      // Also check both id and invoiceHash (to handle key migration cases)
      // If id doesn't match but invoiceHash matches, a key migration occurred and needs updating
      const updatedInvoices = state.invoices.map((inv) =>
        (inv.id === id || inv.invoiceHash === updatedInvoice.invoiceHash)
          ? updatedInvoice
          : inv
      );

      // If the updated invoice is the current invoice, synchronize currentInvoice
      // Also check both id and invoiceHash (to handle key migration cases)
      const newCurrentInvoice = (state.currentInvoice?.id === id ||
                                 state.currentInvoice?.invoiceHash === updatedInvoice.invoiceHash)
        ? updatedInvoice
        : state.currentInvoice;

      // Synchronize the sending index
      let newSending = { ...state.sendingInvoiceHashes };
      const newStatus = updatedInvoice.metadata?.confirmationStatus;

      if (newStatus === 'SENDING') {
        newSending[updatedInvoice.invoiceHash] = true;
      } else if (newStatus === 'CONFIRMED') {
        delete newSending[updatedInvoice.invoiceHash];
      }

      return {
        invoices: updatedInvoices,
        currentInvoice: newCurrentInvoice,
        sendingInvoiceHashes: newSending
      };
    });
  },

  updateChainStatus: (invoiceId, status, hash) => {
    const now = Date.now();
    set((state) => ({
      chainStatusCache: {
        ...state.chainStatusCache,
        [invoiceId]: { status, hash, lastQueried: now }
      }
    }));
  },

  getChainStatus: (invoiceId) => {
    const entry = get().chainStatusCache[invoiceId];
    if (!entry) return null;
    // 30s TTL
    if (Date.now() - entry.lastQueried > 30000) return null;
    return entry.status;
  },

  /**
   * Migrate invoice key: delete old record, create new record (used for key migration in create action)
   */
  migrateInvoiceKey: async (oldId: AleoField, newId: AleoField, updatedInvoice: Partial<Invoice>, options: {
    masterKey?: string;
    persistFull?: boolean;
  } = {}) => {
    const { masterKey, persistFull = true } = options;
    const state = get();

    // Find the current invoice
    let currentInvoice = state.currentInvoice?.id === oldId
      ? state.currentInvoice
      : state.invoices.find(inv => inv.id === oldId);

    if (!currentInvoice) {
      console.warn('[Store.migrateInvoiceKey] Invoice not found:', oldId);
      return;
    }

    if (!persistFull || !masterKey) {
      console.warn('[Store.migrateInvoiceKey] Missing masterKey or persistFull is false');
      return;
    }

    try {
      // 1. Get old record data (from IndexedDB)
      const oldRecordData = await getStorageService().getData<InvoiceStorageData>(
        INVOICE_TABLE,
        oldId
      );

      if (!oldRecordData) {
        console.warn('[Store.migrateInvoiceKey] Old record not found in IndexedDB:', oldId);
        return;
      }

      // 2. Build the complete new invoice object
      const finalMetadata = updatedInvoice.metadata || {
        confirmationStatus: 'CONFIRMED' as ChainConfirmationStatus,
        dataSource: 'chain' as const,
        action: (currentInvoice.metadata?.action || 'create') as 'create' | 'cancel' | 'pay',
        lastUpdated: new Date()
      };

      const updatedInvoiceFull: Invoice = {
        ...currentInvoice,
        ...updatedInvoice,
        id: newId,
        metadata: finalMetadata
      };

      // 3. Encrypt details (if present)
      const encryptedDetails = updatedInvoiceFull.details
        ? await getCryptoService().encryptPayload(updatedInvoiceFull.details, masterKey)
        : oldRecordData.encryptedDetails;

      // 4. Build storage data
      const storageData: InvoiceStorageData = {
        id: newId,
        invoiceHash: updatedInvoiceFull.invoiceHash,
        seller: updatedInvoiceFull.seller,
        buyer: updatedInvoiceFull.buyer,
        amount: updatedInvoiceFull.amount,
        dueDate: updatedInvoiceFull.dueDate,
        createdAt: updatedInvoiceFull.createdAt,
        status: updatedInvoiceFull.status,
        nonce: updatedInvoiceFull.nonce ?? oldRecordData.nonce,
        auditKey: updatedInvoiceFull.auditKey ?? oldRecordData.auditKey,
        encryptedDetails: encryptedDetails,
        metadata: {
          confirmationStatus: finalMetadata.confirmationStatus,
          lastUpdated: new Date(),
          dataSource: finalMetadata.dataSource,
          action: finalMetadata.action
        }
      };

      // 5. Delete old record
      await getStorageService().deleteData(INVOICE_TABLE, [oldId]);
      console.log(`[Store.migrateInvoiceKey] Deleted old record with key: ${oldId}`);

      // 6. Create new record
      await getStorageService().addData(INVOICE_TABLE, newId, storageData);
      console.log(`[Store.migrateInvoiceKey] Created new record with key: ${newId}`);

      // 7. Update memory state
      set((state) => {
        const updatedInvoices = state.invoices
          .filter(inv => inv.id !== oldId)
          .concat(updatedInvoiceFull);

        const newCurrentInvoice = (state.currentInvoice?.id === oldId || state.currentInvoice?.invoiceHash === updatedInvoiceFull.invoiceHash)
          ? updatedInvoiceFull
          : state.currentInvoice;

        // Update sending index (typically status changes to CONFIRMED after migration)
        const newSending = { ...state.sendingInvoiceHashes };
        if (finalMetadata.confirmationStatus === 'CONFIRMED') {
          delete newSending[updatedInvoiceFull.invoiceHash];
        } else if (finalMetadata.confirmationStatus === 'SENDING') {
          newSending[updatedInvoiceFull.invoiceHash] = true;
        }

        return {
          invoices: updatedInvoices,
          currentInvoice: newCurrentInvoice,
          sendingInvoiceHashes: newSending
        };
      });

      console.log('[Store.migrateInvoiceKey] Key migration completed', {
        oldId,
        newId,
        invoiceHash: updatedInvoiceFull.invoiceHash
      });
    } catch (error) {
      console.error('[Store.migrateInvoiceKey] Failed to migrate key:', error);
      throw error;
    }
  },

  /**
   * Get invoice metadata (confirmationStatus) by hash
   */
  getInvoiceMetadata: async (hash: AleoField): Promise<{ confirmationStatus: ChainConfirmationStatus } | null> => {
    try {
      const allDBRecords = await getStorageService().getAllData<InvoiceStorageData>(INVOICE_TABLE);
      const dbRecord = allDBRecords.find(record => record.invoiceHash === hash);

      if (dbRecord) {
        return {
          confirmationStatus: dbRecord.metadata.confirmationStatus
        };
      }
      return null;
    } catch (error) {
      console.error('[Store.getInvoiceMetadata] Failed to load metadata:', error);
      return null;
    }
  },

  /**
   * Get invoice by hash: IndexedDB -> decrypt -> update memory (if needed) -> return
   * Note: Since the key is invoiceId, searching by hash requires iterating all data or using an index.
   * Here we first try to find from memory; if not in memory, load all data from IndexedDB and search.
   */
  getInvoiceByHash: async (hash, options = {}) => {
    const { masterKey, loadFromDB = true } = options;
    const state = get();

    // 1. First search from memory
    const invoiceInMemory = state.invoices.find((inv) => inv.invoiceHash === hash);
    if (invoiceInMemory) {
      return invoiceInMemory;
    }

    // 2. Read from IndexedDB (since the key is invoiceId, need to iterate to find)
    if (loadFromDB && masterKey) {
      try {
        // Get all data, then search by hash
        const allDBRecords = await getStorageService().getAllData<InvoiceStorageData>(INVOICE_TABLE);
        const dbRecord = allDBRecords.find(record => record.invoiceHash === hash);

        if (dbRecord) {
          // Decrypt details (if present)
          const details = dbRecord.encryptedDetails
            ? await getCryptoService().decryptPayload(dbRecord.encryptedDetails, masterKey)
            : undefined;

          // Build complete invoice object (directly using stored fields, including metadata)
          const invoice: Invoice = {
            id: dbRecord.id,
            invoiceHash: dbRecord.invoiceHash,
            seller: dbRecord.seller,
            buyer: dbRecord.buyer,
            amount: dbRecord.amount,
            dueDate: dbRecord.dueDate,
            createdAt: dbRecord.createdAt,
            status: dbRecord.status,
            nonce: dbRecord.nonce,
            auditKey: dbRecord.auditKey,
            details: details,
            metadata: dbRecord.metadata  // Include metadata
          };

          // Update memory state
          set((state) => ({
            invoices: [...state.invoices, invoice]
          }));

          console.log('[Store.getInvoiceByHash] Loaded from IndexedDB:', hash);
          return invoice;
        }
      } catch (error) {
        console.error('[Store.getInvoiceByHash] Failed to load from IndexedDB:', error);
      }
    }

    return null;
  },

  /**
   * Get all invoices from IndexedDB: IndexedDB -> decrypt -> update memory -> return
   *
   * masterKey is optional:
   * - With masterKey: decrypt details, return complete invoices
   * - Without masterKey: do not decrypt details, return only basic information
   */
  getAllInvoices: async (options = {}) => {
    const { masterKey, refreshMemory = true } = options;

    try {
      // 1. Read all records from IndexedDB
      const allDBRecords = await getStorageService().getAllData<InvoiceStorageData>(INVOICE_TABLE);
      console.log(`[Store.getAllInvoices] Found ${allDBRecords.length} invoices in IndexedDB`);
      console.log(`[Store.getAllInvoices] Has masterKey for decryption:`, !!masterKey);

      const invoices: Invoice[] = [];

      // 2. Batch decrypt and build complete invoice objects
      for (const dbRecord of allDBRecords) {
        try {
          // If no masterKey, details will be undefined (this is normal)
          const details = (masterKey && dbRecord.encryptedDetails)
            ? await getCryptoService().decryptPayload(dbRecord.encryptedDetails, masterKey)
            : undefined;

          // Build complete invoice object (directly using stored fields, including metadata)
          const invoice: Invoice = {
            id: dbRecord.id,
            invoiceHash: dbRecord.invoiceHash,
            seller: dbRecord.seller,
            buyer: dbRecord.buyer,
            amount: dbRecord.amount,
            dueDate: dbRecord.dueDate,
            createdAt: dbRecord.createdAt,
            status: dbRecord.status,
            nonce: dbRecord.nonce,
            auditKey: dbRecord.auditKey,
            details: details,
            metadata: dbRecord.metadata  // Include metadata
          };

          invoices.push(invoice);
        } catch (error) {
          console.error(`Failed to decrypt invoice ${dbRecord.invoiceHash}:`, error);
          // Continue processing other invoices (even if decryption fails, retain basic information)
          const invoice: Invoice = {
            id: dbRecord.id,
            invoiceHash: dbRecord.invoiceHash,
            seller: dbRecord.seller,
            buyer: dbRecord.buyer,
            amount: dbRecord.amount,
            dueDate: dbRecord.dueDate,
            createdAt: dbRecord.createdAt,
            status: dbRecord.status,
            nonce: dbRecord.nonce,
            auditKey: dbRecord.auditKey,
            details: undefined,
            metadata: dbRecord.metadata  // Include metadata
          };
          invoices.push(invoice);
        }
      }

      // 3. Update memory state (if refreshMemory is true)
      if (refreshMemory) {
        // Use functional update to ensure state is correctly updated
        set((state) => {
          // Rebuild sending index
          const newSending: Record<AleoField, true> = {};
          for (const invoice of invoices) {
            if (invoice.metadata?.confirmationStatus === 'SENDING') {
              newSending[invoice.invoiceHash] = true;
            }
          }

          return {
            ...state,
            invoices: invoices,
            sendingInvoiceHashes: newSending
          };
        });
        console.log(`[Store.getAllInvoices] Updated memory state with ${invoices.length} invoices`);
        const sendingCount = Object.keys(get().sendingInvoiceHashes).length;
        if (sendingCount > 0) {
          console.log(`[Store.getAllInvoices] Found ${sendingCount} SENDING invoice(s)`);
        }
        if (!masterKey && invoices.length > 0) {
          console.log(`[Store.getAllInvoices] Details not decrypted (no masterKey)`);
        }
      }

      return invoices;
    } catch (error) {
      console.error('[Store.getAllInvoices] Failed to load from IndexedDB:', error);
      throw error;
    }
  },

  /**
   * Batch set invoices: receive array -> clear IndexedDB -> save new data -> update memory
   * Implements a true reset: ensures IndexedDB and memory state are fully consistent
   */
  setInvoices: async (invoices, options = {}) => {
    const { masterKey, persistFull = true, metadata } = options; // Added metadata parameter

    // 1. Batch save to IndexedDB (if enabled)
    if (persistFull && masterKey) {
      try {
        const storageService = getStorageService();

        // First clear the entire table (implement a true reset)
        // Get all existing data, then delete them
        const allExistingData = await storageService.getAllData<InvoiceStorageData>(INVOICE_TABLE);
        console.log('allExistingData', allExistingData)
        if (allExistingData.length > 0) {
          const allKeys = allExistingData.map(item => item.id);
          await storageService.deleteData(INVOICE_TABLE, allKeys);
          console.log(`[Store.setInvoices] Cleared ${allKeys.length} existing invoices from IndexedDB`);
        }

        // Prepare batch data
        const dataList: Array<{ key: string; data: InvoiceStorageData }> = [];

        for (const invoice of invoices) {
          try {
            // Encrypt details (if present)
            const encryptedDetails = invoice.details
              ? await getCryptoService().encryptPayload(invoice.details, masterKey)
              : null;

            // Use the provided metadata or default values
            const invoiceMetadata = metadata || {
              confirmationStatus: 'SENDING' as ChainConfirmationStatus,
              lastUpdated: new Date(),
              dataSource: 'local' as const
            };

            // Build storage data (directly using Invoice's basic fields)
            const storageData: InvoiceStorageData = {
              id: invoice.id,
              invoiceHash: invoice.invoiceHash,
              seller: invoice.seller,
              buyer: invoice.buyer,
              amount: invoice.amount,
              dueDate: invoice.dueDate,
              createdAt: invoice.createdAt,
              status: invoice.status,
              nonce: invoice.nonce,
              auditKey: invoice.auditKey,
              encryptedDetails: encryptedDetails,
              metadata: invoiceMetadata // Use the provided metadata
            };

            dataList.push({
              key: invoice.id,  // Use invoiceId as key
              data: storageData
            });
          } catch (error) {
            console.error(`Failed to prepare invoice ${invoice.invoiceHash} for storage:`, error);
            // Continue processing other invoices
          }
        }

        // Add new data
        if (dataList.length > 0) {
          await storageService.addData(INVOICE_TABLE, dataList);
          console.log(`[Store.setInvoices] Saved ${dataList.length} invoices to IndexedDB`);
        } else {
          console.log(`[Store.setInvoices] No new invoices to save (IndexedDB already cleared)`);
        }
      } catch (error) {
        console.error('[Store.setInvoices] Failed to persist to IndexedDB:', error);
        // Throw error on persistence failure, do not update memory, keep DB and memory in sync
        throw error;
      }
    }

    // 2. Update memory state (only when persistence succeeds or is not required)
    // Also rebuild the sending index
    const newSending: Record<AleoField, true> = {};
    for (const invoice of invoices) {
      if (invoice.metadata?.confirmationStatus === 'SENDING') {
        newSending[invoice.invoiceHash] = true;
      }
    }

    set({
      invoices: invoices,
      sendingInvoiceHashes: newSending
    });

    const sendingCount = Object.keys(newSending).length;
    console.log(`[Store.setInvoices] Updated memory state with ${invoices.length} invoices`);
    if (sendingCount > 0) {
      console.log(`[Store.setInvoices] Rebuilt sending index with ${sendingCount} SENDING invoice(s)`);
    }
  },

  /**
   * Set the current invoice
   */
  setCurrentInvoice: async (hash, options = {}) => {
    const { masterKey } = options;

    if (!hash) {
      set({ currentInvoice: null });
      return;
    }

    const state = get();

    // 1. First search from memory
    let invoice = state.invoices.find((inv) => inv.invoiceHash === hash);

    // 2. If not in memory, load from IndexedDB (reusing getInvoiceByHash logic)
    if (!invoice && masterKey) {
      try {
        const allDBRecords = await getStorageService().getAllData<InvoiceStorageData>(INVOICE_TABLE);
        const dbRecord = allDBRecords.find(record => record.invoiceHash === hash);

        if (dbRecord) {
          // Decrypt details (if present)
          const details = dbRecord.encryptedDetails
            ? await getCryptoService().decryptPayload(dbRecord.encryptedDetails, masterKey)
            : undefined;

          // Build complete invoice object (including metadata)
          invoice = {
            id: dbRecord.id,
            invoiceHash: dbRecord.invoiceHash,
            seller: dbRecord.seller,
            buyer: dbRecord.buyer,
            amount: dbRecord.amount,
            dueDate: dbRecord.dueDate,
            createdAt: dbRecord.createdAt,
            status: dbRecord.status,
            details: details,
            metadata: dbRecord.metadata
          };

          // Update memory state (if invoice is not in memory)
          set((state) => ({
            invoices: [...state.invoices, invoice!]
          }));
        }
      } catch (error) {
        console.error('[Store.setCurrentInvoice] Failed to load from IndexedDB:', error);
      }
    }

    if (invoice) {
      // 3. If invoice has no metadata, fetch from IndexedDB
      if (!invoice.metadata) {
        try {
          const allDBRecords = await getStorageService().getAllData<InvoiceStorageData>(INVOICE_TABLE);
          const dbRecord = allDBRecords.find(record => record.invoiceHash === hash);

          if (dbRecord?.metadata) {
            invoice = {
              ...invoice,
              metadata: dbRecord.metadata
            };
          } else {
            // If no metadata exists, add default values
            invoice = {
              ...invoice,
              metadata: {
                confirmationStatus: 'SENDING' as ChainConfirmationStatus,
                lastUpdated: new Date(),
                dataSource: 'local' as const
              }
            };
          }
        } catch (error) {
          console.error('[Store.setCurrentInvoice] Failed to load metadata:', error);
          // Add default metadata
          invoice = {
            ...invoice,
            metadata: {
              confirmationStatus: 'SENDING' as ChainConfirmationStatus,
              lastUpdated: new Date(),
              dataSource: 'local' as const
            }
          };
        }
      }

      set({ currentInvoice: invoice });
      console.log('[Store.setCurrentInvoice] Set current invoice:', hash);
    } else {
      set({ currentInvoice: null });
      console.warn('[Store.setCurrentInvoice] Invoice not found:', hash);
    }
  },

  // ---------------------------------------------------------------------------
  // SENDING management (unified entry: write immediately after user action, remove after polling confirmation)
  // ---------------------------------------------------------------------------

  /**
   * Mark invoice as SENDING (only updates memory index; persistence is determined by the caller via updateInvoice)
   */
  markInvoiceSending: (invoiceHash: AleoField) => {
    set((state) => {
      // If already in the sending list, do not add again
      if (state.sendingInvoiceHashes[invoiceHash]) {
        return state;
      }

      console.log(`[Store.markInvoiceSending] Adding to sending: ${invoiceHash}`);
      return {
        sendingInvoiceHashes: {
          ...state.sendingInvoiceHashes,
          [invoiceHash]: true
        }
      };
    });
  },

  /**
   * Mark invoice as confirmed (remove from sending index)
   */
  markInvoiceConfirmed: (invoiceHash: AleoField) => {
    set((state) => {
      if (!state.sendingInvoiceHashes[invoiceHash]) {
        return state;
      }

      console.log(`[Store.markInvoiceConfirmed] Removing from sending: ${invoiceHash}`);
      const newSending = { ...state.sendingInvoiceHashes };
      delete newSending[invoiceHash];

      return {
        sendingInvoiceHashes: newSending
      };
    });
  },

  /**
   * Get the list of all currently SENDING invoice hashes
   */
  getSendingInvoiceHashes: () => {
    const state = get();
    return Object.keys(state.sendingInvoiceHashes) as AleoField[];
  },

  /**
   * Rebuild sending index based on invoices (used during initialization/batch overwrite)
   * Scans all invoices and adds those with confirmationStatus === 'SENDING' to the index
   */
  rebuildSendingIndex: () => {
    const state = get();
    const newSending: Record<AleoField, true> = {};

    for (const invoice of state.invoices) {
      if (invoice.metadata?.confirmationStatus === 'SENDING') {
        newSending[invoice.invoiceHash] = true;
      }
    }

    // Also check currentInvoice
    if (state.currentInvoice?.metadata?.confirmationStatus === 'SENDING') {
      newSending[state.currentInvoice.invoiceHash] = true;
    }

    const count = Object.keys(newSending).length;
    console.log(`[Store.rebuildSendingIndex] Rebuilt index with ${count} SENDING invoice(s)`);

    set({ sendingInvoiceHashes: newSending });
  },

}));
