window.onload = function () {
  document.getElementById('itemName').value = ''

  // Execute a function when the user releases a key on the keyboard
  document.getElementById('itemName')
    .addEventListener('keyup', (event) => {
      // Cancel the default action, if needed
      event.preventDefault()
      // Number 13 is the "Enter" key on the keyboard
      if (event.keyCode === 13) {
        // Trigger the button element with a click
        document.getElementById('buttonCompute').click()
      }
    })
}

class Product {
  constructor (nameWithRarity) {
    if (nameWithRarity.slice(-1) === ')') {
      const expr = /\(([^)]+)\)/g
      const rarity = expr.exec(nameWithRarity)[1]
      const rarityDict = { Fine: 2, Masterwork: 3, Rare: 4, Exotic: 5 }
      this.rarity = rarityDict[rarity]
    } else {
      this.rarity = -1
    }
    this.name = this.rarity === -1
      ? nameWithRarity
      : nameWithRarity.replace(/\s\([^)]+\)/g, '')
    this.id = null
    this._parts = null
    this._iPart = null
  }

  printPartList () {
    let partTable = document.getElementById('partTbl')
    partTable.innerHTML = ''
    partTable.innerHTML += '<thead class="thead-light"></thead>'
    let header = partTable.createTHead()
    let row = header.insertRow(0)
    row.insertCell(0).outerHTML = '<th style="width: 60%">Parts item ID</th>'
    row.insertCell(1).outerHTML = '<th style="width: 40%">Quantity</th>'
    for (const part of this.parts) {
      let row = partTable.insertRow(-1)
      row.insertCell(0).innerHTML = part.item_id
      row.insertCell(1).innerHTML = part.count
    }
  }

  computeMaxCraft (expandedBuyList, fullSellList) {
    let result = { numCraft: 0, profit: 0 }
    // Iterate through buy orders
    for (const buyPrice of expandedBuyList) {
      let cost = 0
      fullSellList.forEach((sellList, i) => {
        let qty = 0
        // If current sell order cannot fill required qty, iterate through
        // until we do
        while (qty + sellList[this._iPart[i]].qty < this._parts[i].count) {
          qty += sellList[this._iPart[i]].qty
          cost += sellList[this._iPart[i]].qty * sellList[this._iPart[i]].price
          ++this._iPart[i]
        }
        // add cost of partial sell order
        cost += (this._parts[i].count - qty) * sellList[this._iPart[i]].price
        sellList[this._iPart[i]].qty -= this._parts[i].count - qty
      })
      const currProfit = buyPrice * 0.85 - cost
      if (currProfit > 0) {
        result.profit += currProfit
        ++result.numCraft
      } else {
        return result
      }
    }
  }

  get parts () {
    return this._parts
  }

  get iPart () {
    return this._iPart
  }

  set parts (partsList) {
    this._parts = partsList
    this.iPart = Array(partsList.length).fill(0)
  }

  set iPart (array) {
    this._iPart = array
  }
}

function globalVars () {
  const variables = { maxCraft: 50 }
  return variables
}

function urlPrefix () {
  const variables = {
    gw2Listing: 'https://api.guildwars2.com/v2/commerce/listings/',
    gw2Recipe: 'https://api.guildwars2.com/v2/recipes/',
    spidyItemData: 'https://www.gw2spidy.com/api/v0.9/json/item/',
    spidyItemSearch: 'https://www.gw2spidy.com/api/v0.9/json/item-search/'
  }
  return variables
}

async function fetchJson (
  urlPrefix,
  itemId,
  urlSuffix = null) {
  if (urlSuffix !== null) itemId += '/' + urlSuffix
  // return await (await window.fetch(urlPrefix + itemId)).json()
  return (await window.fetch(urlPrefix + itemId)).json()
}

async function searchForId (
  product,
  pageNumber = 1) {
  let itemId = { hasFound: false, value: -1 }
  await fetchJson(urlPrefix().spidyItemSearch, product.name, pageNumber)
    .then((data) => data.results)
    .then((results) => {
      for (const result of results) {
        if (result.name === product.name && (product.rarity === -1 ||
            result.rarity === product.rarity)) {
          itemId.value = result.data_id
          itemId.hasFound = true
          break
        }
      }
    })
  return itemId.hasFound
    ? itemId.value
    : searchForId(product, ++pageNumber)
}

async function getItemId (product) {
  let itemId = 0
  // Initial fetch to determine if it's a valid name then search via recursion
  // await fetchSpidyItemSearch(product.name)
  await fetchJson(urlPrefix().spidyItemSearch, product.name, 1)
    .then((data) => { if (data.count !== 0) itemId = searchForId(product) })
  return itemId
}

async function getPartList (product) {
  const recipeId = await fetchJson(urlPrefix().spidyItemData, product.id)
    .then((data) => data.result.result_of[0].recipe_id)
  return fetchJson(urlPrefix().gw2Recipe, recipeId)
    .then((data) => data.ingredients)
}

async function getBuyPriceList (product) {
  const buyList = []
  await fetchJson(urlPrefix().gw2Listing, product.id)
    .then((data) => data.buys)
    .then((buyListings) => {
      let totalQty = 0
      for (const listing of buyListings) {
        totalQty += listing.quantity
        // Trim the buy orders quantity of the last element if it exceeds
        // maxCraft
        if (totalQty >= globalVars().maxCraft) {
          buyList.push({
            price: listing.unit_price,
            qty: listing.quantity - (totalQty - globalVars().maxCraft)
          })
          break
        } else {
          buyList.push({ price: listing.unit_price, qty: listing.quantity })
        }
      }
    })
  return buyList
}

async function getSellPriceList (part) {
  const sellList = []
  await fetchJson(urlPrefix().gw2Listing, part.item_id)
    .then((data) => data.sells)
    .then((sellListings) => {
      if (typeof sellListings !== 'undefined') {
        let totalQty = 0
        for (const listing of sellListings) {
          totalQty += listing.quantity
          // Trim the sell orders quantity of the last element if it exceeds
          // maxCraft * qty required per craft
          if (totalQty >= part.count * globalVars().maxCraft) {
            sellList.push({
              price: listing.unit_price,
              qty: listing.quantity - (totalQty - part.count *
                globalVars().maxCraft)
            })
            break
          } else {
            sellList.push({ price: listing.unit_price, qty: listing.quantity })
          }
        }
      }
    })
  return sellList
}

function printListings (
  buyList,
  fullSellList) {
  let listingDiv = document.getElementById('listing')
  // Clear previous tables
  listingDiv.innerHTML = ''
  const colWidth = Math.round(9 / (1 + fullSellList.length))
  listingDiv.innerHTML += '<div class="col-' + colWidth + '"><span>Product</span><table id="buyOrders" class="table listing m-1"><thead class="thead-light"></thead></table></div>'
  let buyOrdersTable = document.getElementById('buyOrders')
  let header = buyOrdersTable.createTHead()
  let row = header.insertRow(0)
  row.insertCell(0).outerHTML = '<th>Price</th>'
  row.insertCell(1).outerHTML = '<th>Quantity</th>'
  for (const listing of buyList) {
    let row = buyOrdersTable.insertRow(-1)
    row.insertCell(0).innerHTML = listing.price
    row.insertCell(1).innerHTML = listing.qty
  }
  for (const iList in fullSellList) {
    listingDiv.innerHTML += '<div class="col-' + colWidth + '"><span>Part ' + (parseInt(iList) + 1) + '</span><table id="sellOrders' + iList + '" class="table listing m-1"><thead class="thead-light"></thead></table></div>'
    let sellOrderTable = document.getElementById('sellOrders' + iList)
    let header = sellOrderTable.createTHead()
    let row = header.insertRow(-1)
    row.insertCell(0).outerHTML = '<th>Price</th>'
    row.insertCell(1).outerHTML = '<th>Quantity</th>'
    for (const listing of fullSellList[iList]) {
      let row = sellOrderTable.insertRow(-1)
      row.insertCell(0).innerHTML = listing.price
      row.insertCell(1).innerHTML = listing.qty
    }
  }
}

function cleanName (itemName) {
  const expr = /[\w\s()']*[^ \t]+/g
  return expr.exec(itemName)[0]
}

async function compute () {
  let item = document.getElementById('itemName')
  if (!item.value) {
    item.placeholder = 'Invalid item name'
    return
  }
  // Remove trailing whitespaces
  item.value = cleanName(item.value)

  let product = new Product(item.value)
  product.id = await getItemId(product)
  console.info('Product base name:', product.name)
  console.info('Rarity ID:', product.rarity)
  console.info('Product item ID:', product.id)

  product.parts = await getPartList(product)
  product.printPartList()

  const buyList = await getBuyPriceList(product)

  // Trim buy list to contain exactly maxCraft buy orders
  const expandedBuyList = []
  for (const listing of buyList) {
    const priceList = Array(listing.qty).fill(listing.price)
    expandedBuyList.push(...priceList)
  }

  // Trim sell lists to contain exact amount for crafting maxCraft orders
  let fullSellList = []
  for (const part of product.parts) {
    await getSellPriceList(part)
      .then((sellList) => {
        // Special handling of item which uses karma instead
        if (sellList.length === 0) {
          sellList.push({ price: 0, qty: globalVars().maxCraft * part.count })
        }
        fullSellList.push(sellList)
      })
  }
  printListings(buyList, fullSellList)

  const result = product.computeMaxCraft(expandedBuyList, fullSellList)
  document.getElementById('numCraft').innerHTML = result.numCraft
  document.getElementById('profit').innerHTML = Math.round(result.profit)
}
