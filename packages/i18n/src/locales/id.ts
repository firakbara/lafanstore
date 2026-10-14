// Indonesian (default store language). This file is the source of truth for the key set:
// every other locale is typed as Record<LocaleKey, string> so a missing key fails typecheck.
// Values are Telegram HTML. Keys ending in a button label (used via `tp`) must not contain HTML.
export const id = {
  // ----- common -----
  'common.back': '⬅️ Kembali',
  'common.mainMenu': '🏠 Menu Utama',
  'common.cancel': '❌ Batal',
  'common.yes': '✅ Ya',
  'common.no': '✖️ Tidak',
  'common.prev': '‹ Sebelumnya',
  'common.next': 'Berikutnya ›',
  'common.page': '{page}/{total}',
  'common.unlimited': '∞',
  'common.on': 'NYALA',
  'common.off': 'MATI',
  'common.none': '-',
  'common.never': 'Belum pernah',
  'common.cancelled': 'Dibatalkan.',

  // ----- main menu -----
  'menu.welcome': '👋 Selamat datang di toko kami!\n\n💰 Saldo Anda: <b>{balance}</b>',
  'menu.shop': '🛍 Toko',
  'menu.topup': '💳 Isi Saldo',
  'menu.profile': '👤 Profil Saya',
  'menu.help': '❓ Bantuan',
  'menu.more': '➕ Lainnya',
  'menu.referral': '🎁 Dapatkan',
  'menu.channel': '📢 Channel',
  'menu.useButtons': 'Gunakan tombol menu di bawah ini 👇',

  // ----- shop -----
  'shop.title': '🛍 <b>Daftar Produk</b>\n\n🟢 tersedia · 🔴 habis\nHalaman {page}/{totalPages} · {total} produk',
  'shop.variantsTitle': '🗂 <b>{name}</b>\n\nPilih varian:\nHalaman {page}/{totalPages} · {total} varian',
  'shop.empty': '🛍 <b>Daftar Produk</b>\n\nBelum ada produk untuk filter ini.',
  'shop.refresh': '🔄 Segarkan',
  'shop.refreshed': 'Diperbarui ✅',
  'shop.sort': 'Urutkan: {sort}',
  'shop.sort.all': 'Semua',
  'shop.sort.available': 'Tersedia',
  'shop.sort.soldout': 'Habis',
  'shop.sort.promo': 'Promo',
  'shop.item': '{icon}{name} - {price} (Stok: {stock})',
  'shop.itemCollection': '{icon}{name} (Paket: {count})',

  // ----- product detail -----
  'product.name': '📦 Produk: <b>{name}</b>',
  'product.basePrice': '🏷 Harga Dasar: {price}',
  'product.stock': '📊 Stok Tersedia: {stock}',
  'product.collection': '🗂 Koleksi: {collection}',
  'product.warranty': '🛡 Garansi: {warranty}',
  'product.warrantyNone': 'Tidak ada',
  'product.promo': '🎁 Promo: Beli {minQty}+ → -{percent}% Diskon',
  'product.quantity': '🧮 Kuantitas: {qty}',
  'product.discount': '🔻 Diskon: -{amount} ({percent}%)',
  'product.voucher': '🎟 Voucher <code>{code}</code>: -{amount}',
  'product.total': '💵 Total Harga: <b>{total}</b>',
  'product.balance': '💰 Saldo: {balance}',
  'product.balanceShort': '⚠️ Saldo kurang {amount}',
  'product.soldOut': '❌ Stok habis',
  'product.qty': 'Jml: {qty}',
  'product.del': 'Del',
  'product.buyBalance': '🛒 Beli dengan saldo',
  'product.payDirect': '⚡ Bayar langsung',
  'product.topup': '💳 Isi Saldo',
  'product.useVoucher': '🎟 Pakai voucher',
  'product.removeVoucher': '🎟 Hapus voucher',
  'product.share': '🔗 Bagikan Tautan',
  'product.viewNote': '📝 Lihat Catatan',
  'product.noteTitle': '📝 Catatan dari admin:',
  'product.noNote': 'Tidak ada catatan untuk produk ini.',
  'product.voucherPrompt': '🎟 <b>Pakai Voucher</b>\n\nKirim kode voucher untuk <b>{name}</b>.',
  'product.voucherApplied': '✅ Voucher dipasang.',
  'product.voucherRemoved': 'Voucher dihapus.',
  'product.maxQty': 'Maksimal {max}.',

  // ----- purchase -----
  'purchase.confirm':
    '🧾 <b>Konfirmasi Pembelian</b>\n\n📦 {name}\n🧮 Jumlah: {qty}\n💵 Total: <b>{total}</b>\n💰 Saldo setelah beli: {after}\n\nLanjutkan pembelian?',
  'purchase.confirmYes': '✅ Ya, beli sekarang',
  'purchase.done': '✅ <b>Pembelian berhasil!</b>\n\nPesanan <code>{code}</code> sudah dikirim di pesan terpisah.\n💰 Saldo: {balance}',
  'purchase.myOrders': '📦 Pesanan Saya',
  'purchase.again': '🛍 Belanja lagi',

  // ----- delivery (renderOrderDelivery) -----
  'delivery.header': '✅ <b>Pesanan {code}</b>\n\n📦 {product} × {qty}\n💵 Total: {total}',
  'delivery.items': '━━━━━━━━━━━━━━━━━━━━\n📋 <b>Item Anda:</b>',
  'delivery.itemsSuffix': '━━━━━━━━━━━━━━━━━━━━',
  'delivery.file': '📎 {count} item terlampir dalam file.\n⚠️ <i>Simpan file ini sebelum kadaluarsa.</i>',
  'delivery.warranty': '🛡 Garansi: <b>{warranty}</b> — hubungi support jika ada masalah.',
  'delivery.thanks': 'Terima kasih telah berbelanja! 🙏\n💬 Ada kendala? Ketik /support',
  'delivery.fileHeader': 'Pesanan {code} - {product} x {qty}\nTanggal: {date}',

  // ----- top-up -----
  'topup.methods': '💳 <b>Isi Saldo</b>\n\n💰 Saldo: {balance}\n⬇️ Minimal: {min}\n\nPilih metode pembayaran:',
  'topup.noMethods': '💳 <b>Isi Saldo</b>\n\nBelum ada metode pembayaran yang tersedia. Silakan hubungi admin.',
  'topup.askAmount':
    '💳 <b>{method}</b>\n\nKirim nominal top up dalam <b>{currency}</b>.\nContoh: <code>{example}</code>\n⬇️ Minimal: {min}',
  'topup.invalidAmount': '⚠️ Nominal tidak valid. Kirim angka saja, contoh: <code>{example}</code>',
  'topup.tooSmall': '⚠️ Nominal terlalu kecil. Minimal {min}.',
  'topup.tooLarge': '⚠️ Nominal terlalu besar. Maksimal {max}.',
  'topup.success': '✅ <b>Top up berhasil!</b>\n\n➕ Ditambahkan: <b>{credited}</b>\n💰 Saldo sekarang: {balance}',

  // ----- direct pay -----
  'pay.methods': '⚡ <b>Bayar Langsung</b>\n\n📦 {name} × {qty}\n💵 Total: <b>{total}</b>\n\nPilih metode pembayaran:',
  'pay.noMethods': '⚡ <b>Bayar Langsung</b>\n\nBelum ada metode pembayaran langsung yang tersedia.',

  // ----- invoice -----
  'invoice.title': '🧾 <b>Tagihan {code}</b>',
  'invoice.purpose.topup': 'Isi saldo',
  'invoice.purpose.order': 'Pembelian',
  'invoice.purpose': '📌 Tujuan: {purpose}',
  'invoice.method': '💳 Metode: {method}',
  'invoice.amount': '💵 Nominal: {amount}',
  'invoice.fee': '➕ Biaya: {fee}',
  'invoice.payAmount': '💰 Total bayar: <b>{payAmount} {payCurrency}</b>',
  'invoice.expires': '⏳ Berlaku sampai {time} ({minutes} menit lagi)',
  'invoice.status': '📍 Status: {status}',
  'invoice.scanQr': '📷 Scan QR di atas dengan aplikasi pembayaran Anda.',
  'invoice.openLink': '🔗 Bayar sekarang',
  'invoice.check': '🔄 Cek Status',
  'invoice.cancel': '❌ Batalkan',
  'invoice.stillPending': 'Belum ada pembayaran masuk. Coba lagi sebentar.',
  'invoice.cancelledToast': 'Tagihan dibatalkan.',
  'invoice.paidOrder': '✅ <b>Pembayaran diterima!</b>\n\nPesanan <code>{code}</code> sudah dikirim di pesan terpisah.',
  'invoice.alreadyPaid': '✅ Tagihan ini sudah dibayar.',
  'invoice.closed': '🧾 <b>Tagihan {code}</b>\n\n📍 Status: {status}',
  'paymentStatus.pending': '⏳ Menunggu pembayaran',
  'paymentStatus.paid': '✅ Lunas',
  'paymentStatus.expired': '⌛ Kedaluwarsa',
  'paymentStatus.failed': '❌ Gagal',
  'paymentStatus.cancelled': '🚫 Dibatalkan',

  'payment.orderRefunded': '↩️ <b>Pembayaran diterima</b>, tetapi stok untuk pesanan <code>{code}</code> sudah habis.\n\n{amount} telah dikembalikan ke saldo Anda.',

  // ----- profile -----
  'profile.text':
    '👤 <b>Profil Saya</b>\n\n🆔 ID: <code>{id}</code>\n👤 Nama: {name}\n💰 Saldo: <b>{balance}</b>\n🌐 Bahasa: {language}\n💱 Mata Uang: {currency}\n🕒 Zona Waktu: {tz}\n📅 Bergabung: {joined}',
  'profile.notifications': '🔔 Notifikasi',
  'profile.orders': '📦 Pesanan Saya',
  'profile.ledger': '📜 Riwayat Saldo',
  'profile.api': '👨‍💻 API Developer',
  'profile.language': '🌐 Bahasa',
  'profile.currency': '💱 Mata Uang',
  'profile.timezone': '🕒 Zona Waktu',

  // ----- notifications -----
  'notify.title': '🔔 <b>Pengaturan Notifikasi</b>\n\nKetuk untuk menyalakan / mematikan:',
  'notify.stock': 'Pembaruan Stok: {state}',
  'notify.info': 'Info & Promo: {state}',
  'notify.referral': 'Referral: {state}',

  // ----- orders -----
  'orders.title': '📦 <b>Pesanan Saya</b>\n\nTotal {total} pesanan. Pilih untuk melihat detail:',
  'orders.empty': '📦 <b>Pesanan Saya</b>\n\nAnda belum memiliki pesanan.',
  'orders.item': '{status} {code} · {product} ×{qty}',
  'orders.detail':
    '🧾 <b>Pesanan {code}</b>\n\n📦 Produk: {product}\n🧮 Jumlah: {qty}\n🏷 Harga satuan: {unit}\n🔻 Diskon: {discount}\n🎟 Voucher: {voucher}\n💵 Total: <b>{total}</b>\n💳 Dibayar dengan: {paidWith}\n📍 Status: {status}\n📅 Tanggal: {date}',
  'orders.resend': '📩 Kirim ulang item',
  'orders.resent': 'Item dikirim ulang ✅',
  'orders.paidWith.balance': 'Saldo',
  'orders.paidWith.payment': 'Pembayaran langsung',
  'orderStatus.pending_payment': '⏳ Menunggu pembayaran',
  'orderStatus.completed': '✅ Selesai',
  'orderStatus.cancelled': '🚫 Dibatalkan',
  'orderStatus.refunded': '↩️ Dikembalikan',

  // ----- ledger -----
  'ledger.title': '📜 <b>Riwayat Saldo</b>',
  'ledger.empty': '📜 <b>Riwayat Saldo</b>\n\nBelum ada transaksi.',
  'ledger.line': '{date} · {type}\n<b>{amount}</b> → {after}',
  'ledgerType.topup': '💳 Top up',
  'ledgerType.topup_bonus': '🎁 Bonus top up',
  'ledgerType.purchase': '🛒 Pembelian',
  'ledgerType.refund': '↩️ Refund',
  'ledgerType.adjustment': '🛠 Penyesuaian admin',
  'ledgerType.referral_transfer': '🎁 Komisi referral',

  // ----- developer API -----
  'api.title':
    '👨‍💻 <b>API Developer</b>\n\nBeli produk secara otomatis lewat HTTP API.\n🌐 Base URL: <code>{baseUrl}</code>\n🔐 Header: <code>Authorization: Bearer &lt;API key&gt;</code>',
  'api.active': '🔑 Key aktif: <code>{prefix}…</code>\n📅 Dibuat: {created}\n🕒 Terakhir dipakai: {lastUsed}',
  'api.none': 'Anda belum memiliki API key.',
  'api.create': '➕ Buat API Key',
  'api.regenerate': '🔁 Buat Ulang Key',
  'api.revoke': '🗑 Cabut Key',
  'api.revokeConfirm': '🗑 <b>Cabut API key?</b>\n\nAplikasi yang memakai key ini akan berhenti bekerja.',
  'api.revoked': 'API key dicabut.',
  'api.created': '🔑 <b>API key baru</b>\n\n<code>{key}</code>\n\n⚠️ Simpan sekarang — key ini hanya ditampilkan sekali.',

  // ----- language / currency / timezone -----
  'language.title': '🌐 <b>Pilih Bahasa</b>',
  'language.changed': 'Bahasa diubah ✅',
  'language.name.id': '🇮🇩 Bahasa Indonesia',
  'language.name.en': '🇬🇧 English',
  'currency.title': '💱 <b>Pilih Mata Uang</b>\n\nHarga dan saldo akan ditampilkan dalam mata uang ini.',
  'currency.changed': 'Mata uang diubah ✅',
  'timezone.title': '🕒 <b>Pilih Zona Waktu</b>\n\nSaat ini: {tz}',
  'timezone.changed': 'Zona waktu diubah ✅',

  // ----- help & support -----
  'help.text': '❓ <b>Bantuan</b>\n\nButuh bantuan? Mulai Dukungan Langsung untuk mengobrol dengan admin, atau hubungi kami melalui kontak di bawah.',
  'help.liveSupport': '💬 Dukungan Langsung',
  'help.contact': '📨 Hubungi Admin',
  'support.opened': '💬 <b>Dukungan Langsung aktif</b>\n\nKirim pesan Anda di chat ini (teks, foto, file). Admin akan membalas secepatnya.',
  'support.openedTopic': '💬 <b>Dukungan Langsung aktif</b>\n\nKirim pesan Anda di topik <b>{topic}</b>. Admin akan membalas di sana.',
  'support.topicName': '💬 Dukungan',
  'support.welcomeTopic': '👋 Tulis pertanyaan Anda di sini. Admin akan membalas secepatnya.',
  'support.close': '❌ Batalkan Dukungan',
  'support.closed': '✅ Sesi dukungan ditutup. Terima kasih!',
  'support.closedByAdmin': '✅ Admin telah menutup sesi dukungan.',
  'support.unavailable': 'Dukungan langsung belum tersedia.',
  'support.adminTopic': '#{id} {name}',
  'support.adminHeader': '🆕 <b>Sesi dukungan #{id}</b>\n👤 {name} {username}\n🆔 <code>{userId}</code>\n💰 Saldo: {balance}\n\nBalas di topik ini untuk menjawab. /close untuk menutup.',
  'support.adminClosed': '🔒 Sesi dukungan #{id} ditutup.',

  // ----- more -----
  'more.title': '➕ <b>Lainnya</b>',
  'more.twofa': '🔐 Pembaca 2FA',
  'more.rating': '⭐ Penilaian',
  'twofa.prompt': '🔐 <b>Pembaca 2FA</b>\n\nKirim secret key 2FA (base32), contoh: <code>JBSWY3DPEHPK3PXP</code>',
  'twofa.result': '🔐 <b>Pembaca 2FA</b>\n\nKode: <code>{code}</code>\n⏳ Berlaku {seconds} detik lagi.',
  'twofa.refresh': '🔄 Perbarui Kode',
  'twofa.new': '🔐 Secret lain',
  'rating.title': '⭐ <b>Penilaian</b>\n\nBagaimana pengalaman Anda berbelanja di sini?',
  'rating.up': '👍 Puas',
  'rating.down': '👎 Kurang puas',
  'rating.thanks': 'Terima kasih atas penilaian Anda! 🙏',

  // ----- referral -----
  'referral.text':
    '🎁 <b>Program Referral</b>\n\nAjak teman dan dapatkan komisi <b>{percent}%</b> dari setiap top up mereka (maks {max} per top up).\n\n👥 Referral 24 jam: {d1}\n👥 Referral 7 hari: {d7}\n👥 Total referral: {total}\n\n💰 Total komisi: {earned}\n✅ Tersedia: <b>{available}</b>\n🔁 Dipindah ke saldo: {transferred}\n🏧 Ditarik: {withdrawn}\n\n🔗 Link referral Anda:\n<code>{link}</code>',
  'referral.copy': '📋 Salin Link Referral',
  'referral.transfer': '🔁 Transfer ke saldo',
  'referral.withdraw': '🏧 Tarik tunai',
  'referral.transferred': '✅ {amount} dipindahkan ke saldo.',
  'referral.nothing': 'Tidak ada komisi yang tersedia.',
  'referral.withdrawPrompt':
    '🏧 <b>Tarik Tunai</b>\n\nJumlah: <b>{amount}</b>\nMinimal: {min}\n\nKirim detail tujuan pembayaran (contoh: <code>DANA 0812xxxx a.n. Nama</code>).',
  'referral.withdrawRequested': '✅ Permintaan penarikan #{id} sebesar {amount} sudah dikirim. Admin akan memprosesnya.',
  'referral.earned': '🎉 Anda mendapatkan komisi referral sebesar <b>{amount}</b>!\nCek menu 🎁 Dapatkan untuk memindahkannya ke saldo.',

  // ----- wallet notices -----
  'wallet.adjusted': '💰 Saldo Anda disesuaikan oleh admin: <b>{amount}</b>\nSaldo sekarang: {balance}',

  // ----- admin -----
  'admin.sale': '🛒 <b>Penjualan baru</b>\n\n🧾 <code>{code}</code>\n👤 {user} (<code>{userId}</code>)\n📦 {product} × {qty}\n💵 {total}\n💳 {paidWith}',
  'admin.addsaldoUsage': 'Penggunaan: <code>/addsaldo &lt;userId&gt; &lt;jumlah USD&gt;</code>\nContoh: <code>/addsaldo 123456789 5</code> atau <code>-2.5</code>',
  'admin.addsaldoDone': '✅ Saldo <code>{userId}</code> {amount}. Saldo baru: {balance}',
  'admin.userNotFound': '⚠️ Pengguna tidak ditemukan.',
  'admin.stats':
    '📊 <b>Statistik</b>\n\n👥 Pengguna: {users} (+{usersToday} hari ini)\n🛒 Pesanan hari ini: {ordersToday} · {revenueToday}\n🛒 Pesanan 30 hari: {orders30} · {revenue30}\n💳 Top up hari ini: {topupsToday} · {topupAmountToday}\n💬 Dukungan terbuka: {supportOpen}',

  // ----- bot commands (setMyCommands) -----
  'commands.start': 'Menu utama',
  'commands.shop': 'Lihat produk',
  'commands.topup': 'Isi saldo',
  'commands.orders': 'Pesanan saya',
  'commands.profile': 'Profil saya',
  'commands.language': 'Ganti bahasa',
  'commands.support': 'Dukungan langsung',
  'commands.api': 'API developer',

  // ----- errors -----
  'errors.NOT_FOUND': '⚠️ Data tidak ditemukan.',
  'errors.USER_BANNED': '⛔ Akun Anda diblokir.',
  'errors.PRODUCT_INACTIVE': '⚠️ Produk ini sedang tidak dijual.',
  'errors.INVALID_QUANTITY': '⚠️ Jumlah tidak valid.',
  'errors.OUT_OF_STOCK': '❌ Stok tidak mencukupi.',
  'errors.INSUFFICIENT_BALANCE': '⚠️ Saldo Anda tidak mencukupi.',
  'errors.VOUCHER_INVALID': '⚠️ Kode voucher tidak valid.',
  'errors.VOUCHER_EXPIRED': '⚠️ Voucher sudah kedaluwarsa.',
  'errors.VOUCHER_LIMIT_REACHED': '⚠️ Batas pemakaian voucher sudah tercapai.',
  'errors.VOUCHER_MIN_TOTAL': '⚠️ Total belanja belum memenuhi minimum voucher.',
  'errors.AMOUNT_TOO_SMALL': '⚠️ Nominal terlalu kecil.',
  'errors.INVALID_STATE': '⚠️ Aksi ini tidak bisa dilakukan sekarang.',
  'errors.INVALID_INPUT': '⚠️ Input tidak valid.',
  'errors.GENERIC': '⚠️ Terjadi kesalahan. Silakan coba lagi.',
  'errors.RATE_LIMITED': '⏳ Terlalu cepat, tunggu sebentar.',
  'errors.EXPIRED_BUTTON': '⌛ Tombol ini sudah tidak berlaku.',
} as const;

export type LocaleKey = keyof typeof id;
