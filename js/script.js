 // ============================================================
    // INDEXEDDB HELPER
    // ============================================================
    const DB_NAME = 'TokoLarisDB';
    const DB_VERSION = 1;

    function openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('products')) {
                    db.createObjectStore('products', { keyPath: 'plu' });
                }
                if (!db.objectStoreNames.contains('transactions')) {
                    const store = db.createObjectStore('transactions', { keyPath: 'id', autoIncrement: true });
                    store.createIndex('tanggal', 'tanggal');
                }
                if (!db.objectStoreNames.contains('pending')) {
                    db.createObjectStore('pending', { keyPath: 'id', autoIncrement: true });
                }
                if (!db.objectStoreNames.contains('sync_state')) {
                    db.createObjectStore('sync_state', { keyPath: 'key' });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async function dbPut(store, data) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(store, 'readwrite');
            const req = tx.objectStore(store).put(data);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async function dbGetAll(store) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(store, 'readonly');
            const req = tx.objectStore(store).getAll();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async function dbGet(store, key) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(store, 'readonly');
            const req = tx.objectStore(store).get(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async function dbDelete(store, key) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(store, 'readwrite');
            const req = tx.objectStore(store).delete(key);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }

    async function dbClear(store) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(store, 'readwrite');
            const req = tx.objectStore(store).clear();
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }

    // ============================================================
    // VUE APP
    // ============================================================
    new Vue({
        el: '#app',
        data: {
            // Auth
            isLoggedIn: false,
            currentUser: null,
            loginForm: { username: '', password: '' },
            loginError: '',
            showLoginModal: false,
            users: [
                { username: 'admin', password: 'admin123', nama: 'Admin', role: 'admin' },
                { username: 'salma', password: 'salma123', nama: 'Salma', role: 'kasir' },
                { username: 'budi', password: 'budi123', nama: 'Budi', role: 'kasir' }
            ],

            // Tab
            activeTab: 'dashboard',

            // Form
            form: {
                tanggal: '',
                barcode: '',
                deskripsi: '',
                qty: 1,
                harga: 0
            },
            items: [],
            paymentMethod: 'Tunai',
            discount: 0,
            history: [],
            products: [],

            // Search
            searchBarcode: '',
            foundProduct: null,

            // Scanner
            isScanning: false,
            lastScannedCode: '',
            scannedProduct: null,
            scanHistory: [],
            html5QrCode: null,

            // Settings
            settings: {
                namaUsaha: 'TOKO LARIS'
            },

            // PRICETAG
            lomagInput: '',
            pricetagItems: [],
            pricetagUkuran: 'panjang',
            pricetagQty: 1,
            generatedPricetags: [],
            lomagResult: null,
            isPricetagCameraOn: false,
            pricetagQrCode: null,
            pricetagCamLastCode: '',
            pricetagCamCooldownUntil: 0,

            // Laporan
            laporanStart: '',
            laporanEnd: '',
            laporanData: null,

            // Network
            networkStatus: { label: 'Online', class: 'online', icon: 'fas fa-wifi' },
            pendingSyncCount: 0,

            // Toast
            toastMessage: '',
            _toastTimeout: null,

            // Chart
            salesChart: null
        },

        computed: {
            grandTotal() {
                return this.items.reduce((sum, item) => sum + (item.total || 0), 0);
            },
            grandTotalAfterDiscount() {
                return Math.max(0, this.grandTotal - (this.discount || 0));
            },
            totalPenjualanHariIni() {
                const today = new Date().toISOString().slice(0, 10);
                return this.history
                    .filter(h => h.tanggal === today)
                    .reduce((sum, h) => sum + h.grandTotal, 0);
            },
            totalTransaksiHariIni() {
                const today = new Date().toISOString().slice(0, 10);
                return this.history.filter(h => h.tanggal === today).length;
            },
            produkStokMenipis() {
                return this.products.filter(p => (p.qty1 || 0) <= 3);
            },
            strukText() {
                let s = '';
                s += '================================\n';
                s += '          ' + this.settings.namaUsaha + '\n';
                s += '     Cihanjuang No. 137\n';
                s += '    Telp. 0821-1880-3884\n';
                s += '================================\n';
                s += `Tanggal  : ${this.form.tanggal || '-'}\n`;
                s += `Kasir    : ${this.currentUser ? this.currentUser.nama : 'Guest'}\n`;
                s += '--------------------------------\n';
                s += 'ITEM            QTY   TOTAL\n';
                if (this.items.length === 0) {
                    s += '   (kosong)\n';
                } else {
                    this.items.forEach(item => {
                        const desc = (item.deskripsi || 'item').slice(0, 14);
                        s += `${desc.padEnd(14)} ${String(item.qty).padStart(3)}  ${this.formatRupiah(item.total).padStart(12)}\n`;
                    });
                }
                s += '--------------------------------\n';
                s += `Subtotal     : ${this.formatRupiah(this.grandTotal)}\n`;
                if (this.discount > 0) s += `Diskon       : ${this.formatRupiah(this.discount)}\n`;
                s += `Grand Total  : ${this.formatRupiah(this.grandTotalAfterDiscount)}\n`;
                s += `Metode Bayar : ${this.paymentMethod}\n`;
                s += '================================\n';
                s += '   Terima kasih belanja!\n';
                return s;
            }
        },

        methods: {
    // ========== AUTH ==========
    login() {
        const user = this.users.find(u => 
            u.username === this.loginForm.username && 
            u.password === this.loginForm.password
        );
        if (user) {
            this.currentUser = user;
            this.isLoggedIn = true;
            this.loginError = '';
            this.showLoginModal = false;
            localStorage.setItem('currentUser', JSON.stringify(user));
            this.showToast(`✅ Selamat datang, ${user.nama}!`);
        } else {
            this.loginError = 'Username atau password salah!';
        }
    },
    logout() {
        this.isLoggedIn = false;
        this.currentUser = null;
        localStorage.removeItem('currentUser');
        this.showToast('👋 Sampai jumpa!');
    },
    closeLoginModal() {
        this.showLoginModal = false;
        this.loginError = '';
    },
    loadUser() {
        const stored = localStorage.getItem('currentUser');
        if (stored) {
            try {
                const user = JSON.parse(stored);
                if (this.users.find(u => u.username === user.username)) {
                    this.currentUser = user;
                    this.isLoggedIn = true;
                }
            } catch(e) {}
        }
    },

    // ========== FORMAT ==========
    formatRupiah(val) {
        if (!val && val !== 0) return 'Rp 0';
        return 'Rp ' + Number(val).toLocaleString('id-ID');
    },
    formatAngka(val) {
        return Number(val || 0).toLocaleString('id-ID');
    },

    // ========== DATABASE ==========
    async loadProductsFromDB() {
        try {
            this.products = await dbGetAll('products');
        } catch(e) {
            console.error('Load products error:', e);
            this.products = [];
        }
    },
    async loadHistoryFromDB() {
        try {
            this.history = await dbGetAll('transactions');
            this.history.sort((a, b) => b.id - a.id);
        } catch(e) {
            console.error('Load history error:', e);
            this.history = [];
        }
    },
    async loadPendingSync() {
        try {
            const pending = await dbGetAll('pending');
            this.pendingSyncCount = pending.length;
        } catch(e) {
            this.pendingSyncCount = 0;
        }
    },
    async saveProductToDB(product) {
        await dbPut('products', product);
    },
    async saveTransactionToDB(transaction) {
        await dbPut('transactions', transaction);
    },
    async deleteTransactionFromDB(id) {
        await dbDelete('transactions', id);
    },
    async clearProductsDB() {
        await dbClear('products');
    },
    async clearTransactionsDB() {
        await dbClear('transactions');
    },

    // ========== UPLOAD EXCEL ==========
    triggerUpload() {
        if (!this.isLoggedIn) {
            this.showToast('⚠ Login terlebih dahulu');
            return;
        }
        this.$refs.fileInput.click();
    },
    handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(firstSheet);
                
                const products = jsonData.map(row => ({
                    plu: String(row.plu || row.PLU || ''),
                    desc: row.desc || row.desc || row.desc || '',
                    s_descp: row.s_descp || '',
                    barcode: String(row.barcode || row.BARCODE || ''),
                    kategori: row.kategori || '',
                    price1: parseFloat(row.price1 || row.PRICE1 || 0),
                    price2: parseFloat(row.price2 || 0),
                    price3: parseFloat(row.price3 || 0),
                    qty1: parseInt(row.qty1 || 0),
                    qty2: parseInt(row.qty2 || 0),
                    qty3: parseInt(row.qty3 || 0),
                    lokasi_rak: row.lokasi_rak || '',
                    retur_hari: (row.retur_hari === undefined || row.retur_hari === null || row.retur_hari === '') ? 0 : parseInt(row.retur_hari) || 0,
                    satuan: row.satuan || row.SATUAN || 'PCS',
                    minStock: 3
                }));

                for (const p of products) {
                    await this.saveProductToDB(p);
                }
                this.products = products;
                this.showToast(`✅ ${products.length} produk berhasil diupload!`);
                this.$refs.fileInput.value = '';
            } catch (error) {
                this.showToast('⚠ Gagal membaca file: ' + error.message);
            }
        };
        reader.readAsArrayBuffer(file);
    },

    // ========== CEK HARGA ==========
    findProduct() {
        const keyword = this.searchBarcode.trim();
        if (!keyword) { this.foundProduct = null; return; }
        this.foundProduct = this.products.find(p => 
            String(p.barcode).toLowerCase() === keyword.toLowerCase() ||
            String(p.plu).toLowerCase() === keyword.toLowerCase()
        ) || null;
    },
    selectProductFromList(p) {
        this.searchBarcode = p.barcode || p.plu;
        this.foundProduct = p;
        this.showToast(`✅ ${p.desc || p.s_descp} ditemukan`);
    },

    // ========== SCANNER ==========
    async startScanner() {
        try {
            this.html5QrCode = new Html5Qrcode("reader");
            await this.html5QrCode.start(
                { facingMode: "environment" },
                { fps: 10, qrbox: { width: 220, height: 220 }, aspectRatio: 1.0 },
                this.onScanSuccess,
                this.onScanError
            );
            this.isScanning = true;
            this.showToast('📷 Scanner aktif!');
        } catch (err) {
            this.showToast('⚠ Gagal akses kamera: ' + err.message);
        }
    },
    stopScanner() {
        if (this.html5QrCode) {
            this.html5QrCode.stop().then(() => {
                this.isScanning = false;
                this.showToast('Scanner dihentikan');
            });
        }
    },
    onScanSuccess(decodedText) {
        this.lastScannedCode = decodedText;
        const product = this.products.find(p => 
            String(p.barcode).toLowerCase() === decodedText.toLowerCase() ||
            String(p.plu).toLowerCase() === decodedText.toLowerCase()
        );
        if (product) {
            this.scannedProduct = product;
            this.scanHistory.unshift({
                barcode: decodedText,
                desc: product.desc || product.s_descp,
                price: product.price1
            });
            this.showToast(`✅ ${product.desc || product.s_descp} ditemukan!`);
        } else {
            this.scannedProduct = null;
            this.showToast('⚠ Barcode tidak ditemukan');
        }
        this.stopScanner();
    },
    onScanError(err) {},
    addScannedToStruk() {
        if (!this.isLoggedIn) {
            this.showToast('⚠ Login terlebih dahulu');
            return;
        }
        if (!this.scannedProduct) return;
        const p = this.scannedProduct;
        this.items.push({
            barcode: p.barcode || p.plu,
            deskripsi: p.desc || p.s_descp,
            qty: 1,
            harga: p.price1,
            total: p.price1
        });
        this.showToast('✔ Ditambahkan ke struk');
        this.activeTab = 'struk';
    },

    // ✅ METHOD INI DIPINDAHKAN KE SINI (SEJAJAR DENGAN METHOD LAIN)
    addScannedToPricetag() {
        if (!this.scannedProduct) return;
        const product = this.scannedProduct;
        const tag = this.buildTagFromProduct(product);
        this.pricetagItems.push(tag);
        this.lomagInput = this.pricetagItems.map(i => i.barcode).join('\n');
        this.showToast(`✅ ${tag.name} ditambahkan ke pricetag`);
        this.activeTab = 'pricetag';
        this.generatePricetagsFromItems();
    },

    // ========== PRICETAG FUNCTIONS ==========
    formatReturText(returHari) {
        if (!returHari || returHari === 0 || returHari === '0' || returHari === '') return 'NO RETUR';
        if (typeof returHari === 'string') {
            if (returHari.includes('R_NOTE')) {
                return returHari.replace('R_NOTE - ', 'R_NOTE ').slice(0, 18);
            }
            if (returHari.includes('R_H-')) {
                return returHari.slice(0, 12);
            }
            if (returHari.includes('HARI')) {
                const num = returHari.match(/\d+/);
                if (num) return `R_${num[0]}D`;
                return returHari.slice(0, 12);
            }
            if (returHari.includes('R_')) {
                return returHari.slice(0, 14);
            }
            const num = parseInt(returHari);
            if (!isNaN(num) && num > 0) return `R_${num}D`;
            return returHari.slice(0, 14);
        }
        const num = parseInt(returHari);
        if (!isNaN(num) && num > 0) return `R_${num}D`;
        return 'NO RETUR';
    },
    formatTanggalTag(d) {
        const bulan = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = bulan[d.getMonth()];
        const yyyy = d.getFullYear();
        return `${dd}-${mm}-${yyyy}`;
    },
    buildTagFromProduct(product) {
        let nama = product.desc || product.s_descp || 'Produk';
        if (nama.length > 40) {
            nama = nama.slice(0, 40) + '...';
        }
        return {
            barcode: String(product.barcode || product.plu || '0'),
            name: nama,
            price: product.price1 || 0,
            plu: String(product.plu || '-'),
            rak: String(product.lokasi_rak || '-'),
            retur: this.formatReturText(product.retur_hari || 0),
            satuan: product.satuan || 'PCS',
            tanggal: this.formatTanggalTag(new Date())
        };
    },
    processLomagInput() {
        const raw = this.lomagInput || '';
        const barcodes = raw.split('\n').map(b => b.trim()).filter(b => b.length > 0);
        
        if (barcodes.length === 0) {
            this.showToast('⚠ Masukkan minimal satu barcode');
            return;
        }

        let found = 0, notFound = 0;
        const items = [];

        barcodes.forEach(bc => {
            let product = this.products.find(p => 
                String(p.barcode).toLowerCase() === bc.toLowerCase()
            );
            if (!product) {
                product = this.products.find(p => 
                    String(p.plu).toLowerCase() === bc.toLowerCase()
                );
            }
            
            if (product) {
                items.push(this.buildTagFromProduct(product));
                found++;
            } else {
                notFound++;
            }
        });

        this.pricetagItems = items;
        this.lomagResult = { found, notFound };
        this.showToast(`✅ ${found} produk ditemukan${notFound > 0 ? `, ${notFound} tidak ditemukan` : ''}`);
        
        if (found > 0) {
            this.generatePricetagsFromItems();
        }
    },
    uploadLomagFile() {
        const fileInput = document.getElementById('lomag-file-input');
        const file = fileInput.files[0];
        if (!file) {
            this.showToast('⚠ Pilih file terlebih dahulu');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                let barcodes = [];
                
                if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                    const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
                    jsonData.forEach(row => {
                        if (row[0]) {
                            const val = String(row[0]).trim();
                            if (val) barcodes.push(val);
                        }
                    });
                } else {
                    const text = e.target.result;
                    barcodes = text.split('\n').map(b => b.trim()).filter(b => b.length > 0);
                }

                if (barcodes.length === 0) {
                    this.showToast('⚠ Tidak ada barcode yang ditemukan di file');
                    return;
                }

                let found = 0, notFound = 0;
                const items = [];
                barcodes.forEach(bc => {
                    let product = this.products.find(p => 
                        String(p.barcode).toLowerCase() === bc.toLowerCase()
                    );
                    if (!product) {
                        product = this.products.find(p => 
                            String(p.plu).toLowerCase() === bc.toLowerCase()
                        );
                    }
                    if (product) {
                        items.push(this.buildTagFromProduct(product));
                        found++;
                    } else {
                        notFound++;
                    }
                });

                this.pricetagItems = items;
                this.lomagInput = this.pricetagItems.map(i => i.barcode).join('\n');
                this.lomagResult = { found, notFound };
                this.showToast(`✅ ${found} produk ditemukan${notFound > 0 ? `, ${notFound} tidak ditemukan` : ''}`);
                
                if (found > 0) {
                    this.generatePricetagsFromItems();
                }
                
                fileInput.value = '';
            } catch (err) {
                this.showToast('⚠ Gagal membaca file: ' + err.message);
                fileInput.value = '';
            }
        };

        if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
            reader.readAsArrayBuffer(file);
        } else {
            reader.readAsText(file);
        }
    },
    clearPricetagItems() {
        this.lomagInput = '';
        this.pricetagItems = [];
        this.generatedPricetags = [];
        this.lomagResult = null;
        this.showToast('🧹 Pricetag dibersihkan');
    },
    generatePricetagsFromItems() {
        if (this.pricetagItems.length === 0) {
            this.showToast('⚠ Tidak ada item untuk digenerate');
            return;
        }

        this.generatedPricetags = [];
        this.pricetagItems.forEach(item => {
            for (let i = 0; i < this.pricetagQty; i++) {
                this.generatedPricetags.push({
                    ...item,
                    id: Date.now() + '_' + Math.random().toString(36).substr(2, 5)
                });
            }
        });

        this.showToast(`✅ ${this.generatedPricetags.length} pricetag digenerate`);
        this.$nextTick(() => {
            this.renderBarcodes();
        });
    },
    renderBarcodes() {
        this.generatedPricetags.forEach((tag, idx) => {
            const el = document.getElementById('barcode-' + idx);
            if (el) {
                try {
                    JsBarcode(el, tag.barcode, {
                        format: "CODE128",
                        width: this.pricetagUkuran === 'panjang' ? 1.5 : 1.2,
                        height: this.pricetagUkuran === 'panjang' ? 28 : 20,
                        displayValue: false,
                        fontSize: 10,
                        margin: 2,
                        background: "#ffffff",
                        lineColor: "#000000"
                    });
                } catch(e) {
                    console.warn('Barcode render error:', e);
                }
            }
        });
    },
    clearGeneratedPricetags() {
        this.generatedPricetags = [];
        this.showToast('🧹 Semua pricetag dihapus');
    },

    // ========== PRICETAG CAMERA ==========
    async togglePricetagCamera() {
        if (this.isPricetagCameraOn) {
            await this.stopPricetagCamera();
        } else {
            await this.startPricetagCamera();
        }
    },
    async startPricetagCamera() {
        try {
            const container = document.getElementById('scanner-pricetag');
            if (!container) {
                this.showToast('⚠ Container kamera tidak ditemukan');
                return;
            }
            
            container.innerHTML = '';
            container.style.display = 'block';
            container.style.minHeight = '250px';
            container.style.background = '#1a202c';
            container.style.borderRadius = '12px';
            container.style.overflow = 'hidden';
            
            this.pricetagQrCode = new Html5Qrcode("scanner-pricetag");
            
            await this.pricetagQrCode.start(
                { facingMode: "environment" },
                { 
                    fps: 10, 
                    qrbox: { width: 220, height: 220 }, 
                    aspectRatio: 1.0 
                },
                this.onPricetagCameraScan.bind(this),
                (error) => {}
            );
            
            this.isPricetagCameraOn = true;
            this.showToast('📷 Kamera pricetag aktif — arahkan ke barcode produk');
            
        } catch (err) {
            console.error('Error start camera:', err);
            this.isPricetagCameraOn = false;
            this.showToast('⚠ Gagal akses kamera: ' + err.message);
        }
    },
    async stopPricetagCamera() {
        if (this.pricetagQrCode) {
            try {
                await this.pricetagQrCode.stop();
                await this.pricetagQrCode.clear();
            } catch (e) {
                console.log('Stop camera error:', e);
            }
            this.pricetagQrCode = null;
        }
        const container = document.getElementById('scanner-pricetag');
        if (container) {
            container.style.display = 'none';
            container.innerHTML = '';
        }
        this.isPricetagCameraOn = false;
        this.showToast('📷 Kamera pricetag dimatikan');
    },
    onPricetagCameraScan(decodedText) {
        const now = Date.now();
        const cleanCode = String(decodedText || '').trim();
        if (!cleanCode) return;
        // cegah double scan beruntun barcode sama
        if (cleanCode === this.pricetagCamLastCode && now < this.pricetagCamCooldownUntil) return;
        this.pricetagCamLastCode = cleanCode;
        this.pricetagCamCooldownUntil = now + 1500;

        // Cari produk - toleran leading zero & case
        let product = this.products.find(p => {
            const bc = String(p.barcode || '').trim().toLowerCase();
            const plu = String(p.plu || '').trim().toLowerCase();
            const target = cleanCode.toLowerCase();
            return bc === target || plu === target || bc.replace(/^0+/, '') === target.replace(/^0+/, '');
        });
        
        if (product) {
            const tag = this.buildTagFromProduct(product);
            // 1. Masukkan ke list items (agar textarea lomagInput terisi)
            this.pricetagItems.push(tag);
            this.lomagInput = this.pricetagItems.map(i => i.barcode).join('\n');
            // 2. FIX UTAMA: Langsung masukkan juga ke generatedPricetags (jendela cetak)
            //    Biar kamera scan langsung muncul di preview tanpa harus klik Generate lagi
            for (let i = 0; i < this.pricetagQty; i++) {
                this.generatedPricetags.push({
                    ...tag,
                    id: Date.now() + '_' + Math.random().toString(36).substr(2, 5) + '_' + i
                });
            }
            this.showToast(`✅ ${tag.name} ditambahkan ke pricetag (${this.generatedPricetags.length} total)`);
            // 3. Render barcode secara paksa setelah DOM update
            this.$nextTick(() => {
                this.renderBarcodes();
                // scroll preview ke bawah biar kelihatan hasil scan baru
                const container = document.getElementById('pricetagContainer');
                if (container) container.scrollTop = container.scrollHeight;
            });
            setTimeout(() => {
                this.pricetagCamLastCode = '';
            }, 1200);
        } else {
            this.showToast(`⚠ Barcode ${cleanCode} tidak ditemukan di database`);
            // tetap clear cooldown biar bisa scan barcode lain langsung
            setTimeout(() => { this.pricetagCamLastCode = ''; }, 800);
        }
    },
    openPricetagScanner() {
        if (!this.isPricetagCameraOn) {
            this.startPricetagCamera();
        } else {
            this.showToast('📷 Kamera sudah aktif');
        }
    },

    // ========== PRINT & EXPORT PRICETAG ==========
    printPricetags() {
        if (this.generatedPricetags.length === 0) {
            this.showToast('⚠ Tidak ada pricetag untuk dicetak');
            return;
        }

        const printZone = document.getElementById('print-zone');
        printZone.className = this.pricetagUkuran === 'panjang' ? 'grid-panjang' : 'grid-pendek';
        printZone.innerHTML = '';

        const container = document.getElementById('pricetagContainer');
        const clones = container.querySelectorAll('.pricetag-preview');
        clones.forEach(clone => {
            const newClone = clone.cloneNode(true);
            newClone.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
            printZone.appendChild(newClone);
        });

        setTimeout(() => {
            const svgs = printZone.querySelectorAll('svg');
            svgs.forEach((svg, idx) => {
                try {
                    const barcode = this.generatedPricetags[idx]?.barcode || '0';
                    JsBarcode(svg, barcode, {
                        format: "CODE128",
                        width: this.pricetagUkuran === 'panjang' ? 1.5 : 1.2,
                        height: this.pricetagUkuran === 'panjang' ? 28 : 20,
                        displayValue: false,
                        fontSize: 10,
                        margin: 2
                    });
                } catch(e) {}
            });
        }, 100);

        setTimeout(() => {
            window.print();
        }, 300);
    },
    async exportPricetagPDF() {
        if (this.generatedPricetags.length === 0) {
            this.showToast('⚠ Tidak ada pricetag untuk diexport');
            return;
        }

        const { jsPDF } = window.jspdf;
        const isPanjang = this.pricetagUkuran === 'panjang';
        const tagWidth = isPanjang ? 64 : 39;
        const tagHeight = 35;
        const marginX = 10;
        const marginY = 10;
        const gapX = 4;
        const gapY = 4;

        const doc = new jsPDF('p', 'mm', 'a4');
        const pageWidth = 210;
        const pageHeight = 297;
        const colsPerRow = Math.floor((pageWidth - marginX * 2 + gapX) / (tagWidth + gapX));
        const rowsPerPage = Math.floor((pageHeight - marginY * 2 + gapY) / (tagHeight + gapY));
        const tagsPerPage = colsPerRow * rowsPerPage;

        for (let page = 0; page < Math.ceil(this.generatedPricetags.length / tagsPerPage); page++) {
            if (page > 0) doc.addPage();
            const startIdx = page * tagsPerPage;
            const endIdx = Math.min(startIdx + tagsPerPage, this.generatedPricetags.length);

            for (let i = startIdx; i < endIdx; i++) {
                const localIdx = i - startIdx;
                const row = Math.floor(localIdx / colsPerRow);
                const col = localIdx % colsPerRow;
                const x = marginX + col * (tagWidth + gapX);
                const y = marginY + row * (tagHeight + gapY);
                const tag = this.generatedPricetags[i];

                doc.setFillColor(255, 255, 255);
                doc.rect(x, y, tagWidth, tagHeight, 'F');

                doc.setDrawColor(160, 174, 192);
                doc.setLineDashPattern([0.5, 0.5]);
                doc.setLineWidth(0.2);
                doc.rect(x, y, tagWidth, tagHeight, 'S');
                doc.setLineDashPattern([], 0);

                doc.setFontSize(isPanjang ? 8 : 6);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(0, 0, 0);
                let nama = tag.nama || 'Produk';
                if (nama.length > (isPanjang ? 35 : 20)) nama = nama.slice(0, isPanjang ? 35 : 20) + '...';
                doc.text(nama, x + 2, y + 4);

                doc.setFontSize(isPanjang ? 16 : 12);
                doc.setFont('helvetica', 'bold');
                const hargaText = 'Rp ' + this.formatAngka(tag.price);
                const satuanText = '/' + (tag.satuan || 'PCS');
                doc.setFontSize(isPanjang ? 16 : 12);
                doc.text(hargaText, x + 2, y + 8.5);
                doc.setFontSize(isPanjang ? 9 : 6.5);
                doc.text(satuanText, x + 2 + doc.getTextWidth(hargaText) + 1, y + 8.5);

                const barcodeY = y + 12;
                const barcodeMaxHeight = isPanjang ? 7 : 5.5;
                try {
                    const canvas = document.createElement('canvas');
                    const barcodeVal = String(tag.barcode || '0');
                    JsBarcode(canvas, barcodeVal, {
                        format: "CODE128",
                        width: 2,
                        height: 30,
                        displayValue: false,
                        margin: 2,
                        background: "#ffffff",
                        lineColor: "#000000"
                    });
                    const imgData = canvas.toDataURL('image/png');
                    const aspectRatio = canvas.height / canvas.width;
                    let imgWidth = tagWidth - 4;
                    let imgHeight = imgWidth * aspectRatio;
                    if (imgHeight > barcodeMaxHeight) {
                        imgHeight = barcodeMaxHeight;
                        imgWidth = imgHeight / aspectRatio;
                    }
                    const imgX = x + tagWidth / 2 - imgWidth / 2;
                    doc.addImage(imgData, 'PNG', imgX, barcodeY, imgWidth, imgHeight);
                } catch(e) {
                    doc.setFontSize(isPanjang ? 6 : 5);
                    doc.text(String(tag.barcode), x + tagWidth/2, barcodeY + 3, { align: 'center' });
                }

                doc.setFontSize(isPanjang ? 6 : 4.5);
                doc.setFont('courier', 'bold');
                doc.text(String(tag.barcode || ''), x + tagWidth/2, barcodeY + barcodeMaxHeight + 2.5, { align: 'center' });

                const footerY = y + tagHeight - (isPanjang ? 8.5 : 7.5);
                const blueHeight = isPanjang ? 4 : 3.5;
                const redHeight = isPanjang ? 4 : 3.5;
                const gap1 = 1;

                doc.setFillColor(2, 132, 199);
                doc.rect(x, footerY, tagWidth, blueHeight, 'F');
                doc.setFontSize(isPanjang ? 7 : 5.5);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(0, 0, 0);
                doc.text(String(tag.plu || '-'), x + 2, footerY + blueHeight - 1);

                doc.setFontSize(isPanjang ? 6 : 5);
                doc.text(String(tag.rak || '-'), x + tagWidth - 2, footerY + blueHeight - 1, { align: 'right' });

                const redY = footerY + blueHeight + gap1;

                doc.setFillColor(220, 38, 38);
                doc.rect(x, redY, tagWidth, redHeight, 'F');
                doc.setFontSize(isPanjang ? 7 : 5.5);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(0, 0, 0);
                doc.text(String(tag.retur || 'NO RETUR'), x + 2, redY + redHeight - 1);
                doc.text(String(tag.tanggal || ''), x + tagWidth - 2, redY + redHeight - 1, { align: 'right' });
            }
        }

        doc.save(`pricetag_${this.pricetagUkuran}_${new Date().toISOString().slice(0,10)}.pdf`);
        this.showToast('📄 PDF pricetag siap!');
    },

    // ========== SETTINGS ==========
    loadSettings() {
        try {
            const raw = localStorage.getItem('posSettings');
            if (raw) this.settings = { ...this.settings, ...JSON.parse(raw) };
        } catch (e) {}
        document.title = this.settings.namaUsaha + ' - POS v3.0 (Offline)';
    },
    saveSettings() {
        localStorage.setItem('posSettings', JSON.stringify(this.settings));
        document.title = this.settings.namaUsaha + ' - POS v3.0 (Offline)';
        this.showToast('✅ Nama usaha disimpan');
    },
    loadUserNames() {
        try {
            const raw = localStorage.getItem('posUserNames');
            if (!raw) return;
            const saved = JSON.parse(raw);
            this.users.forEach(u => { if (saved[u.username]) u.nama = saved[u.username]; });
            if (this.currentUser) {
                const match = this.users.find(u => u.username === this.currentUser.username);
                if (match) this.currentUser.nama = match.nama;
            }
        } catch (e) {}
    },
    saveUserName(user) {
        try {
            const raw = localStorage.getItem('posUserNames');
            const saved = raw ? JSON.parse(raw) : {};
            saved[user.username] = user.nama;
            localStorage.setItem('posUserNames', JSON.stringify(saved));
            if (this.currentUser && this.currentUser.username === user.username) {
                this.currentUser.nama = user.nama;
                localStorage.setItem('currentUser', JSON.stringify(this.currentUser));
            }
            this.showToast(`✅ Nama untuk "${user.username}" disimpan`);
        } catch (e) {
            this.showToast('⚠ Gagal menyimpan nama');
        }
    },

    // ========== STRUK ==========
    addItem() {
        if (!this.isLoggedIn) {
            this.showToast('⚠ Login terlebih dahulu');
            return;
        }
        const { barcode, deskripsi, qty, harga } = this.form;
        if (!deskripsi || qty < 1 || harga <= 0) {
            this.showToast('⚠ Data tidak lengkap!');
            return;
        }
        this.items.push({
            barcode: barcode || '-',
            deskripsi: deskripsi,
            qty: qty,
            harga: harga,
            total: qty * harga
        });
        this.form.barcode = '';
        this.form.deskripsi = '';
        this.form.qty = 1;
        this.form.harga = 0;
        this.showToast('✔ Item ditambahkan');
    },
    removeItem(idx) {
        this.items.splice(idx, 1);
        this.showToast('Item dihapus');
    },
    updateQty(idx, delta) {
        const item = this.items[idx];
        const newQty = item.qty + delta;
        if (newQty < 1) return;
        item.qty = newQty;
        item.total = item.qty * item.harga;
    },
    clearStruk() {
        this.items = [];
        this.discount = 0;
        this.showToast('Struk dikosongkan');
    },
    searchProduct() {
        const keyword = this.form.barcode.trim();
        if (!keyword) return;
        const product = this.products.find(p => 
            String(p.barcode).toLowerCase() === keyword.toLowerCase() ||
            String(p.plu).toLowerCase() === keyword.toLowerCase()
        );
        if (product) {
            this.form.deskripsi = product.desc || product.s_descp || '';
            this.form.harga = product.price1 || 0;
            if ((product.qty1 || 0) <= 0) this.showToast('⚠ Stok habis!');
        }
    },
    printStruk() {
        const content = this.strukText;
        const win = window.open('', '_blank');
        win.document.write(`
            <html><head><title>Struk ${this.settings.namaUsaha}</title>
            <style>body{font-family:'Courier New',monospace;padding:20px;background:white;display:flex;justify-content:center;align-items:center;min-height:100vh;}
            pre{white-space:pre-wrap;font-size:14px;max-width:320px;margin:0 auto;}
            @media print{body{padding:10px;}}</style>
            </head><body><pre>${content}</pre>
            <script>window.onload=function(){window.print();setTimeout(window.close,2000)};<\/script>
            </body></html>
        `);
        win.document.close();
    },

    // ========== HISTORY ==========
    async saveToHistory() {
        if (!this.isLoggedIn) {
            this.showToast('⚠ Login terlebih dahulu');
            return;
        }
        if (this.items.length === 0) {
            this.showToast('⚠ Tidak ada item!');
            return;
        }
        
        this.items.forEach(item => {
            const product = this.products.find(p => 
                String(p.barcode) === String(item.barcode) ||
                String(p.plu) === String(item.barcode)
            );
            if (product) {
                product.qty1 = (product.qty1 || 0) - item.qty;
                if (product.qty1 < 0) product.qty1 = 0;
                this.saveProductToDB(product);
            }
        });

        const transaction = {
            tanggal: this.form.tanggal,
            items: JSON.parse(JSON.stringify(this.items)),
            grandTotal: this.grandTotalAfterDiscount,
            payment: this.paymentMethod,
            discount: this.discount,
            kasir: this.currentUser ? this.currentUser.nama : 'Salma',
            created_at: new Date().toISOString(),
            synced: false
        };

        await this.saveTransactionToDB(transaction);
        await this.loadHistoryFromDB();
        
        await dbPut('pending', { 
            type: 'transaction',
            data: transaction,
            created_at: new Date().toISOString()
        });
        await this.loadPendingSync();

        this.showToast('✔ Tersimpan ke history (offline)');
        this.items = [];
        this.discount = 0;
        this.initChart();
    },
    async deleteHistory(idx) {
        const item = this.history[idx];
        if (item && item.id) {
            await this.deleteTransactionFromDB(item.id);
            await this.loadHistoryFromDB();
            this.showToast('History dihapus');
        }
    },
    async clearHistory() {
        if (confirm('Hapus semua history?')) {
            await this.clearTransactionsDB();
            this.history = [];
            this.showToast('History cleared');
        }
    },

    // ========== LAPORAN ==========
    generateLaporan() {
        const start = this.laporanStart || '2000-01-01';
        const end = this.laporanEnd || '2099-12-31';
        const filtered = this.history.filter(h => h.tanggal >= start && h.tanggal <= end);
        const totalPenjualan = filtered.reduce((sum, h) => sum + h.grandTotal, 0);
        this.laporanData = {
            totalPenjualan: totalPenjualan,
            totalTransaksi: filtered.length,
            rataRata: filtered.length > 0 ? this.formatRupiah(totalPenjualan / filtered.length) : 'Rp 0',
            transaksi: filtered
        };
        this.showToast(`📊 Laporan ${filtered.length} transaksi`);
    },
    exportLaporanExcel() {
        if (!this.laporanData || this.laporanData.transaksi.length === 0) {
            this.showToast('⚠ Tidak ada data');
            return;
        }
        const data = this.laporanData.transaksi.map((h, idx) => ({
            'No': idx + 1,
            'Tanggal': h.tanggal,
            'Kasir': h.kasir || '-',
            'Total': h.grandTotal,
            'Metode': h.payment || '-',
            'Item': h.items.length
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Laporan');
        XLSX.writeFile(wb, `laporan_${this.laporanStart}_${this.laporanEnd}.xlsx`);
        this.showToast('📁 Excel siap');
    },
    exportLaporanPDF() {
        if (!this.laporanData || this.laporanData.transaksi.length === 0) {
            this.showToast('⚠ Tidak ada data');
            return;
        }
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');
        let y = 20;
        doc.setFontSize(16);
        doc.text('LAPORAN PENJUALAN', 14, y);
        y += 8;
        doc.setFontSize(11);
        doc.text(`Periode: ${this.laporanStart} - ${this.laporanEnd}`, 14, y);
        y += 6;
        doc.text(`Total Transaksi: ${this.laporanData.totalTransaksi}`, 14, y);
        y += 6;
        doc.text(`Total Penjualan: ${this.formatRupiah(this.laporanData.totalPenjualan)}`, 14, y);
        y += 10;
        doc.setFontSize(8);
        this.laporanData.transaksi.forEach(h => {
            if (y > 270) { doc.addPage(); y = 20; }
            doc.text(`${h.tanggal} | ${h.kasir || '-'} | ${this.formatRupiah(h.grandTotal)} | ${h.payment || '-'}`, 14, y);
            y += 5;
        });
        doc.save(`laporan_${this.laporanStart}_${this.laporanEnd}.pdf`);
        this.showToast('📄 PDF siap');
    },

    // ========== DATABASE EXPORT ==========
    exportProductsExcel() {
        if (this.products.length === 0) {
            this.showToast('⚠ Tidak ada data');
            return;
        }
        const data = this.products.map(p => ({
            plu: p.plu,
            desc: p.desc,
            s_descp: p.s_descp,
            barcode: p.barcode,
            kategori: p.kategori,
            price1: p.price1,
            price2: p.price2,
            price3: p.price3,
            qty1: p.qty1,
            qty2: p.qty2,
            qty3: p.qty3,
            lokasi_rak: p.lokasi_rak,
            retur_hari: p.retur_hari || 0,
            satuan: p.satuan || 'PCS'
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Produk');
        XLSX.writeFile(wb, `produk_${new Date().toISOString().slice(0,10)}.xlsx`);
        this.showToast('📁 Excel produk siap');
    },

    // ========== CLEAR PRODUCTS ==========
    async clearProducts() {
        if (!this.isLoggedIn || this.currentUser.role !== 'admin') {
            this.showToast('⚠ Hanya admin yang dapat menghapus database');
            return;
        }
        if (confirm('Hapus semua data produk dari database?')) {
            await this.clearProductsDB();
            this.products = [];
            this.showToast('Database produk dihapus');
        }
    },

    // ========== NETWORK ==========
    checkNetwork() {
        const online = navigator.onLine;
        if (online) {
            this.networkStatus = { label: 'Online', class: 'online', icon: 'fas fa-wifi' };
            this.syncPending();
        } else {
            this.networkStatus = { label: 'Offline', class: 'offline', icon: 'fas fa-wifi-slash' };
        }
    },
    async syncPending() {
        if (!navigator.onLine) return;
        try {
            const pending = await dbGetAll('pending');
            if (pending.length === 0) {
                this.pendingSyncCount = 0;
                return;
            }
            this.networkStatus = { label: 'Sync...', class: 'sync', icon: 'fas fa-sync fa-spin' };
            for (const item of pending) {
                await dbDelete('pending', item.id);
            }
            this.pendingSyncCount = 0;
            this.networkStatus = { label: 'Online', class: 'online', icon: 'fas fa-wifi' };
            this.showToast(`✅ ${pending.length} data tersinkronisasi`);
        } catch(e) {
            console.error('Sync error:', e);
            this.networkStatus = { label: 'Sync Gagal', class: 'offline', icon: 'fas fa-exclamation-triangle' };
        }
    },

    // ========== TOAST ==========
    showToast(msg) {
        this.toastMessage = msg;
        const el = document.getElementById('toast');
        el.classList.add('show');
        clearTimeout(this._toastTimeout);
        this._toastTimeout = setTimeout(() => {
            el.classList.remove('show');
        }, 3000);
    },

    // ========== CHART ==========
    initChart() {
        const ctx = document.getElementById('salesChart');
        if (!ctx) return;
        const labels = [];
        const data = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().slice(0, 10);
            labels.push(dateStr);
            const total = this.history
                .filter(h => h.tanggal === dateStr)
                .reduce((sum, h) => sum + h.grandTotal, 0);
            data.push(total);
        }
        if (this.salesChart) this.salesChart.destroy();
        this.salesChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Penjualan (Rp)',
                    data: data,
                    backgroundColor: 'rgba(49, 130, 206, 0.6)',
                    borderColor: '#3182ce',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { callback: function(value) { return 'Rp ' + value.toLocaleString('id-ID'); } }
                    }
                }
            }
        });
    }
},

        watch: {
            history() { this.initChart(); },
            'generatedPricetags': function() {
                if (this.generatedPricetags.length > 0) {
                    this.$nextTick(() => {
                        this.renderBarcodes();
                    });
                }
            },
            activeTab(newTab, oldTab) {
                if (oldTab === 'pricetag' && this.isPricetagCameraOn) {
                    this.stopPricetagCamera();
                }
                if (newTab !== 'pricetag') {
                    this.lomagResult = null;
                }
            }
        },

        async mounted() {
            this.loadUser();
            this.loadSettings();
            this.loadUserNames();
            await this.loadProductsFromDB();
            await this.loadHistoryFromDB();
            await this.loadPendingSync();
            
            const today = new Date().toISOString().slice(0, 10);
            this.form.tanggal = today;
            this.laporanStart = today;
            this.laporanEnd = today;
            
            this.checkNetwork();
            window.addEventListener('online', () => { this.checkNetwork(); });
            window.addEventListener('offline', () => { this.checkNetwork(); });
            
            setTimeout(() => this.initChart(), 500);
            
            setInterval(() => {
                if (navigator.onLine) this.syncPending();
            }, 30000);
        }
    });
