import type { LocaleKey } from './id';

// English. Typed against the Indonesian key set: a missing or extra key fails typecheck.
export const en: Record<LocaleKey, string> = {
  // ----- common -----
  'common.back': '⬅️ Back',
  'common.mainMenu': '🏠 Main Menu',
  'common.cancel': '❌ Cancel',
  'common.yes': '✅ Yes',
  'common.no': '✖️ No',
  'common.prev': '‹ Previous',
  'common.next': 'Next ›',
  'common.page': '{page}/{total}',
  'common.unlimited': '∞',
  'common.on': 'ON',
  'common.off': 'OFF',
  'common.none': '-',
  'common.never': 'Never',
  'common.cancelled': 'Cancelled.',

  // ----- main menu -----
  'menu.welcome': '👋 Welcome to our store!\n\n💰 Your balance: <b>{balance}</b>',
  'menu.shop': '🛍 Shop',
  'menu.topup': '💳 Top Up',
  'menu.profile': '👤 My Profile',
  'menu.help': '❓ Help',
  'menu.more': '➕ More',
  'menu.referral': '🎁 Earn',
  'menu.channel': '📢 Channel',
  'menu.useButtons': 'Use the menu buttons below 👇',

  // ----- shop -----
  'shop.title': '🛍 <b>Products</b>\n\n🟢 in stock · 🔴 sold out\nPage {page}/{totalPages} · {total} products',
  'shop.variantsTitle': '🗂 <b>{name}</b>\n\nChoose a variant:\nPage {page}/{totalPages} · {total} variants',
  'shop.empty': '🛍 <b>Products</b>\n\nNo products match this filter yet.',
  'shop.refresh': '🔄 Refresh',
  'shop.refreshed': 'Refreshed ✅',
  'shop.sort': 'Sort: {sort}',
  'shop.sort.all': 'All',
  'shop.sort.available': 'In stock',
  'shop.sort.soldout': 'Sold out',
  'shop.sort.promo': 'Promo',
  'shop.item': '{icon}{name} - {price} (Stock: {stock})',
  'shop.itemCollection': '{icon}{name} (Bundle: {count})',

  // ----- product detail -----
  'product.name': '📦 Product: <b>{name}</b>',
  'product.basePrice': '🏷 Base Price: {price}',
  'product.stock': '📊 Stock Available: {stock}',
  'product.collection': '🗂 Collection: {collection}',
  'product.warranty': '🛡 Warranty: {warranty}',
  'product.warrantyNone': 'None',
  'product.promo': '🎁 Promo: Buy {minQty}+ → -{percent}% Discount',
  'product.quantity': '🧮 Quantity: {qty}',
  'product.discount': '🔻 Discount: -{amount} ({percent}%)',
  'product.voucher': '🎟 Voucher <code>{code}</code>: -{amount}',
  'product.total': '💵 Total Price: <b>{total}</b>',
  'product.balance': '💰 Balance: {balance}',
  'product.balanceShort': '⚠️ Balance short by {amount}',
  'product.soldOut': '❌ Sold out',
  'product.qty': 'Qty: {qty}',
  'product.del': 'Del',
  'product.buyBalance': '🛒 Buy with balance',
  'product.payDirect': '⚡ Pay directly',
  'product.topup': '💳 Top Up',
  'product.useVoucher': '🎟 Use voucher',
  'product.removeVoucher': '🎟 Remove voucher',
  'product.share': '🔗 Share Link',
  'product.viewNote': '📝 View Note',
  'product.noteTitle': '📝 Note from admin:',
  'product.noNote': 'There is no note for this product.',
  'product.voucherPrompt': '🎟 <b>Use Voucher</b>\n\nSend the voucher code for <b>{name}</b>.',
  'product.voucherApplied': '✅ Voucher applied.',
  'product.voucherRemoved': 'Voucher removed.',
  'product.maxQty': 'Maximum {max}.',

  // ----- purchase -----
  'purchase.confirm':
    '🧾 <b>Confirm Purchase</b>\n\n📦 {name}\n🧮 Quantity: {qty}\n💵 Total: <b>{total}</b>\n💰 Balance after: {after}\n\nProceed with the purchase?',
  'purchase.confirmYes': '✅ Yes, buy now',
  'purchase.done': '✅ <b>Purchase successful!</b>\n\nOrder <code>{code}</code> was delivered in a separate message.\n💰 Balance: {balance}',
  'purchase.myOrders': '📦 My Orders',
  'purchase.again': '🛍 Shop again',

  // ----- delivery -----
  'delivery.header': '✅ <b>Order {code}</b>\n\n📦 {product} × {qty}\n💵 Total: {total}',
  'delivery.items': '━━━━━━━━━━━━━━━━━━━━\n📋 <b>Your items:</b>',
  'delivery.itemsSuffix': '━━━━━━━━━━━━━━━━━━━━',
  'delivery.file': '📎 {count} items attached as a file.\n⚠️ <i>Save this file before it expires.</i>',
  'delivery.warranty': '🛡 Warranty: <b>{warranty}</b> — contact support if you have issues.',
  'delivery.thanks': 'Thank you for shopping with us! 🙏\n💬 Need help? Type /support',
  'delivery.fileHeader': 'Order {code} - {product} x {qty}\nDate: {date}',

  // ----- top-up -----
  'topup.methods': '💳 <b>Top Up</b>\n\n💰 Balance: {balance}\n⬇️ Minimum: {min}\n\nChoose a payment method:',
  'topup.noMethods': '💳 <b>Top Up</b>\n\nNo payment methods are available yet. Please contact the admin.',
  'topup.askAmount': '💳 <b>{method}</b>\n\nSend the top-up amount in <b>{currency}</b>.\nExample: <code>{example}</code>\n⬇️ Minimum: {min}',
  'topup.invalidAmount': '⚠️ Invalid amount. Send a number only, e.g. <code>{example}</code>',
  'topup.tooSmall': '⚠️ Amount too small. Minimum is {min}.',
  'topup.tooLarge': '⚠️ Amount too large. Maximum is {max}.',
  'topup.success': '✅ <b>Top-up successful!</b>\n\n➕ Added: <b>{credited}</b>\n💰 Balance now: {balance}',

  // ----- direct pay -----
  'pay.methods': '⚡ <b>Pay Directly</b>\n\n📦 {name} × {qty}\n💵 Total: <b>{total}</b>\n\nChoose a payment method:',
  'pay.noMethods': '⚡ <b>Pay Directly</b>\n\nNo direct payment methods are available yet.',

  // ----- invoice -----
  'invoice.title': '🧾 <b>Invoice {code}</b>',
  'invoice.purpose.topup': 'Balance top-up',
  'invoice.purpose.order': 'Purchase',
  'invoice.purpose': '📌 Purpose: {purpose}',
  'invoice.method': '💳 Method: {method}',
  'invoice.amount': '💵 Amount: {amount}',
  'invoice.fee': '➕ Fee: {fee}',
  'invoice.payAmount': '💰 To pay: <b>{payAmount} {payCurrency}</b>',
  'invoice.expires': '⏳ Valid until {time} ({minutes} min left)',
  'invoice.status': '📍 Status: {status}',
  'invoice.scanQr': '📷 Scan the QR above with your payment app.',
  'invoice.openLink': '🔗 Pay now',
  'invoice.check': '🔄 Check Status',
  'invoice.cancel': '❌ Cancel',
  'invoice.stillPending': 'No payment received yet. Try again in a moment.',
  'invoice.cancelledToast': 'Invoice cancelled.',
  'invoice.paidOrder': '✅ <b>Payment received!</b>\n\nOrder <code>{code}</code> was delivered in a separate message.',
  'invoice.alreadyPaid': '✅ This invoice is already paid.',
  'invoice.closed': '🧾 <b>Invoice {code}</b>\n\n📍 Status: {status}',
  'paymentStatus.pending': '⏳ Awaiting payment',
  'paymentStatus.paid': '✅ Paid',
  'paymentStatus.expired': '⌛ Expired',
  'paymentStatus.failed': '❌ Failed',
  'paymentStatus.cancelled': '🚫 Cancelled',

  'payment.orderRefunded': '↩️ <b>Payment received</b>, but order <code>{code}</code> ran out of stock.\n\n{amount} was refunded to your balance.',

  // ----- profile -----
  'profile.text':
    '👤 <b>My Profile</b>\n\n🆔 ID: <code>{id}</code>\n👤 Name: {name}\n💰 Balance: <b>{balance}</b>\n🌐 Language: {language}\n💱 Currency: {currency}\n🕒 Time zone: {tz}\n📅 Joined: {joined}',
  'profile.notifications': '🔔 Notifications',
  'profile.orders': '📦 My Orders',
  'profile.ledger': '📜 Balance History',
  'profile.api': '👨‍💻 Developer API',
  'profile.language': '🌐 Language',
  'profile.currency': '💱 Currency',
  'profile.timezone': '🕒 Time Zone',

  // ----- notifications -----
  'notify.title': '🔔 <b>Notification Settings</b>\n\nTap to turn on / off:',
  'notify.stock': 'Stock Updates: {state}',
  'notify.info': 'News & Promos: {state}',
  'notify.referral': 'Referral: {state}',

  // ----- orders -----
  'orders.title': '📦 <b>My Orders</b>\n\n{total} orders in total. Pick one to see details:',
  'orders.empty': '📦 <b>My Orders</b>\n\nYou have no orders yet.',
  'orders.item': '{status} {code} · {product} ×{qty}',
  'orders.detail':
    '🧾 <b>Order {code}</b>\n\n📦 Product: {product}\n🧮 Quantity: {qty}\n🏷 Unit price: {unit}\n🔻 Discount: {discount}\n🎟 Voucher: {voucher}\n💵 Total: <b>{total}</b>\n💳 Paid with: {paidWith}\n📍 Status: {status}\n📅 Date: {date}',
  'orders.resend': '📩 Resend items',
  'orders.resent': 'Items resent ✅',
  'orders.paidWith.balance': 'Balance',
  'orders.paidWith.payment': 'Direct payment',
  'orderStatus.pending_payment': '⏳ Awaiting payment',
  'orderStatus.completed': '✅ Completed',
  'orderStatus.cancelled': '🚫 Cancelled',
  'orderStatus.refunded': '↩️ Refunded',

  // ----- ledger -----
  'ledger.title': '📜 <b>Balance History</b>',
  'ledger.empty': '📜 <b>Balance History</b>\n\nNo transactions yet.',
  'ledger.line': '{date} · {type}\n<b>{amount}</b> → {after}',
  'ledgerType.topup': '💳 Top-up',
  'ledgerType.topup_bonus': '🎁 Top-up bonus',
  'ledgerType.purchase': '🛒 Purchase',
  'ledgerType.refund': '↩️ Refund',
  'ledgerType.adjustment': '🛠 Admin adjustment',
  'ledgerType.referral_transfer': '🎁 Referral commission',

  // ----- developer API -----
  'api.title':
    '👨‍💻 <b>Developer API</b>\n\nBuy products automatically over HTTP.\n🌐 Base URL: <code>{baseUrl}</code>\n🔐 Header: <code>Authorization: Bearer &lt;API key&gt;</code>',
  'api.active': '🔑 Active key: <code>{prefix}…</code>\n📅 Created: {created}\n🕒 Last used: {lastUsed}',
  'api.none': 'You do not have an API key yet.',
  'api.create': '➕ Create API Key',
  'api.regenerate': '🔁 Regenerate Key',
  'api.revoke': '🗑 Revoke Key',
  'api.revokeConfirm': '🗑 <b>Revoke API key?</b>\n\nApps using this key will stop working.',
  'api.revoked': 'API key revoked.',
  'api.created': '🔑 <b>New API key</b>\n\n<code>{key}</code>\n\n⚠️ Save it now — it is shown only once.',

  // ----- language / currency / timezone -----
  'language.title': '🌐 <b>Choose Language</b>',
  'language.changed': 'Language changed ✅',
  'language.name.id': '🇮🇩 Bahasa Indonesia',
  'language.name.en': '🇬🇧 English',
  'currency.title': '💱 <b>Choose Currency</b>\n\nPrices and balance will be shown in this currency.',
  'currency.changed': 'Currency changed ✅',
  'timezone.title': '🕒 <b>Choose Time Zone</b>\n\nCurrent: {tz}',
  'timezone.changed': 'Time zone changed ✅',

  // ----- help & support -----
  'help.text': '❓ <b>Help</b>\n\nNeed help? Start Live Support to chat with an admin, or reach us via the contact below.',
  'help.liveSupport': '💬 Live Support',
  'help.contact': '📨 Contact Admin',
  'support.opened': '💬 <b>Live Support is on</b>\n\nSend your message in this chat (text, photos, files). An admin will reply soon.',
  'support.openedTopic': '💬 <b>Live Support is on</b>\n\nSend your message in the <b>{topic}</b> topic. An admin will reply there.',
  'support.topicName': '💬 Support',
  'support.welcomeTopic': '👋 Write your question here. An admin will reply soon.',
  'support.close': '❌ End Support',
  'support.closed': '✅ Support session closed. Thank you!',
  'support.closedByAdmin': '✅ The admin closed the support session.',
  'support.unavailable': 'Live support is not available yet.',
  'support.adminTopic': '#{id} {name}',
  'support.adminHeader': '🆕 <b>Support session #{id}</b>\n👤 {name} {username}\n🆔 <code>{userId}</code>\n💰 Balance: {balance}\n\nReply in this topic to answer. /close to close.',
  'support.adminClosed': '🔒 Support session #{id} closed.',

  // ----- more -----
  'more.title': '➕ <b>More</b>',
  'more.twofa': '🔐 2FA Reader',
  'more.rating': '⭐ Rating',
  'twofa.prompt': '🔐 <b>2FA Reader</b>\n\nSend a 2FA secret key (base32), e.g. <code>JBSWY3DPEHPK3PXP</code>',
  'twofa.result': '🔐 <b>2FA Reader</b>\n\nCode: <code>{code}</code>\n⏳ Valid for {seconds} more seconds.',
  'twofa.refresh': '🔄 Refresh Code',
  'twofa.new': '🔐 Another secret',
  'rating.title': '⭐ <b>Rating</b>\n\nHow was your shopping experience?',
  'rating.up': '👍 Good',
  'rating.down': '👎 Not good',
  'rating.thanks': 'Thanks for your rating! 🙏',

  // ----- referral -----
  'referral.text':
    '🎁 <b>Referral Program</b>\n\nInvite friends and earn <b>{percent}%</b> of each of their top-ups (max {max} per top-up).\n\n👥 Referrals 24h: {d1}\n👥 Referrals 7d: {d7}\n👥 Total referrals: {total}\n\n💰 Total earned: {earned}\n✅ Available: <b>{available}</b>\n🔁 Moved to balance: {transferred}\n🏧 Withdrawn: {withdrawn}\n\n🔗 Your referral link:\n<code>{link}</code>',
  'referral.copy': '📋 Copy Referral Link',
  'referral.transfer': '🔁 Transfer to balance',
  'referral.withdraw': '🏧 Cash out',
  'referral.transferred': '✅ {amount} moved to your balance.',
  'referral.nothing': 'No commission available.',
  'referral.withdrawPrompt':
    '🏧 <b>Cash Out</b>\n\nAmount: <b>{amount}</b>\nMinimum: {min}\n\nSend your payout details (e.g. <code>PayPal name@example.com</code>).',
  'referral.withdrawRequested': '✅ Withdrawal request #{id} for {amount} sent. The admin will process it.',
  'referral.earned': '🎉 You earned a referral commission of <b>{amount}</b>!\nOpen 🎁 Earn to move it to your balance.',

  // ----- wallet notices -----
  'wallet.adjusted': '💰 Your balance was adjusted by an admin: <b>{amount}</b>\nBalance now: {balance}',

  // ----- admin -----
  'admin.sale': '🛒 <b>New sale</b>\n\n🧾 <code>{code}</code>\n👤 {user} (<code>{userId}</code>)\n📦 {product} × {qty}\n💵 {total}\n💳 {paidWith}',
  'admin.addsaldoUsage': 'Usage: <code>/addsaldo &lt;userId&gt; &lt;USD amount&gt;</code>\nExample: <code>/addsaldo 123456789 5</code> or <code>-2.5</code>',
  'admin.addsaldoDone': '✅ Balance of <code>{userId}</code> {amount}. New balance: {balance}',
  'admin.userNotFound': '⚠️ User not found.',
  'admin.stats':
    '📊 <b>Stats</b>\n\n👥 Users: {users} (+{usersToday} today)\n🛒 Orders today: {ordersToday} · {revenueToday}\n🛒 Orders 30 days: {orders30} · {revenue30}\n💳 Top-ups today: {topupsToday} · {topupAmountToday}\n💬 Open support: {supportOpen}',

  // ----- bot commands -----
  'commands.start': 'Main menu',
  'commands.shop': 'Browse products',
  'commands.topup': 'Top up balance',
  'commands.orders': 'My orders',
  'commands.profile': 'My profile',
  'commands.language': 'Change language',
  'commands.support': 'Live support',
  'commands.api': 'Developer API',

  // ----- errors -----
  'errors.NOT_FOUND': '⚠️ Not found.',
  'errors.USER_BANNED': '⛔ Your account is blocked.',
  'errors.PRODUCT_INACTIVE': '⚠️ This product is not for sale right now.',
  'errors.INVALID_QUANTITY': '⚠️ Invalid quantity.',
  'errors.OUT_OF_STOCK': '❌ Not enough stock.',
  'errors.INSUFFICIENT_BALANCE': '⚠️ Insufficient balance.',
  'errors.VOUCHER_INVALID': '⚠️ Invalid voucher code.',
  'errors.VOUCHER_EXPIRED': '⚠️ This voucher has expired.',
  'errors.VOUCHER_LIMIT_REACHED': '⚠️ This voucher has reached its usage limit.',
  'errors.VOUCHER_MIN_TOTAL': '⚠️ Order total is below the voucher minimum.',
  'errors.AMOUNT_TOO_SMALL': '⚠️ Amount too small.',
  'errors.INVALID_STATE': '⚠️ This action is not possible right now.',
  'errors.INVALID_INPUT': '⚠️ Invalid input.',
  'errors.GENERIC': '⚠️ Something went wrong. Please try again.',
  'errors.RATE_LIMITED': '⏳ Too fast, please wait a moment.',
  'errors.EXPIRED_BUTTON': '⌛ This button has expired.',
};
