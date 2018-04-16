window.onload = function () {
  document.getElementById('itemName').value = ''
}

function globalVars () {
  const variables = { maxCraft: 50 };
  return variables;
}

function getRarity (itemName) {
  if (itemName.slice(-1) == ')') {
    const expr = /\(([^)]+)\)/g
    const rarity = expr.exec(itemName)[1]
    const rarityDict = {
      Fine: 2,
      Masterwork: 3,
      Rare: 4,
      Exotic: 5
    }
    return rarityDict[rarity]
  } else {
    return -1
  }
}

async function fetchSpidyItemSearch (
    itemName
  , pageNumber = 1) {
  const urlPrefix = 'http://www.gw2spidy.com/api/v0.9/json/item-search/'
  return await (await fetch(urlPrefix + itemName + '/' + pageNumber)).json()
}

async function fetchSpidyItemData (dataId) {
  const urlPrefix = 'http://www.gw2spidy.com/api/v0.9/json/item/'
  return await (await fetch(urlPrefix + dataId)).json()
}

async function fetchGw2Recipe(itemId) {
  const urlPrefix = 'https://api.guildwars2.com/v2/recipes/'
  return await (await fetch(urlPrefix + itemId)).json()
}

async function fetchGw2Listing (itemId) {
  const urlPrefix = 'https://api.guildwars2.com/v2/commerce/listings/'
  return await (await fetch(urlPrefix + itemId)).json()
}

async function searchForId (
    product
  , pageNumber = 1) {
  let itemId = { hasFound: false, value: -1 }
  await fetchSpidyItemSearch(product.name, pageNumber)
  .then((data) => data.results)
  .then(function (results) {
    for (let i in results) {
      if (results[i].name === product.name && (product.rarity === -1 ||
          results[i].rarity === product.rarity)) {
        itemId.value = results[i].data_id
        itemId.hasFound = true
        break
      }
    }
  })
  if (!itemId.hasFound) {
    return await getId(product, ++pageNumber)
  } else {
    return itemId
  }
}

async function getItemId (product) {
  let itemId = 0
  // Initial fetch to determine if it's a valid name then search via recursion
  await fetchSpidyItemSearch(product.name)
  .then(function (data) {
    if (data.count != 0) {
      itemId = searchForId(product)
        .then((id) => id.value)
    }
  })
  return itemId;
}

async function getPartList (itemId) {
  const recipeId = await fetchSpidyItemData(itemId)
      .then((data) => data.result.result_of[0].recipe_id)
  return await fetchGw2Recipe(recipeId)
      .then((data) => data.ingredients)
}

async function getBuyPriceList (itemId) {
  const buyList = []
  await fetchGw2Listing(itemId)
  .then((data) => data.buys)
  .then(function (buyListings) {
    let totalQty = 0;
    for (let i in buyListings) {
      buyList.push([buyListings[i].unit_price, buyListings[i].quantity]);
      totalQty += buyListings[i].quantity;
      if (totalQty >= globalVars().maxCraft) break;
    }
  })
  return buyList;
}

async function getSellPriceList (part) {
  const sellList = []
  await fetchGw2Listing(part.item_id)
  .then((data) => data.sells)
  .then(function (sellListings) {
    let totalQty = 0
    for (let i in sellListings) {
      sellList.push([sellListings[i].unit_price, sellListings[i].quantity]);
      totalQty += sellListings[i].quantity;
      if (totalQty >= part.count * globalVars().maxCraft) break;
    }
  })
  return sellList
}

function printPartList (partList) {
  let partTable = document.getElementById('partTbl')
      .getElementsByTagName('tbody')[0]
  for (let iPart in partList) {
    let row = partTable.insertRow(-1)
    row.insertCell(0).innerHTML = partList[iPart].item_id
    row.insertCell(1).innerHTML = partList[iPart].count
  }
}

function printBuyOrders (buyList) {
  let buyOrdersTable = document.getElementById('buyOrders')
      .getElementsByTagName('tbody')[0]
  for (let iListing in buyList) {
    let row = buyOrdersTable.insertRow(-1)
    row.insertCell(0).innerHTML = buyList[iListing][0]
    row.insertCell(1).innerHTML = buyList[iListing][1]
  }
}

function printSellOrders (fullSellList) {
  let listingDiv = document.getElementById('listing')
  for (let iList in fullSellList) {
    listingDiv.innerHTML += '<table id="sellOrders' + iList + '" border="1" style="display: inline-block;"></table>'
    let sellOrderTable = document.getElementById('sellOrders' + iList)
    let row = sellOrderTable.insertRow(-1)
    row.insertCell(0).outerHTML = '<th>Price</th>'
    row.insertCell(1).outerHTML = '<th>Quantity</th>'
    for (let iListing in fullSellList[iList]) {
      let row = sellOrderTable.insertRow(-1)
      row.insertCell(0).innerHTML = fullSellList[iList][iListing][0]
      row.insertCell(1).innerHTML = fullSellList[iList][iListing][1]
    }
  }
}

function setDebugText (text) {
  document.getElementById('debug').innerHTML = text
}

function cleanName (itemName) {
  const expr = /[\w\s\(\)']*[^ \t]+/g
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
  const itemRarity = getRarity(item.value)

  let product = {
    name: itemRarity === -1
      ? item.value
      : item.value.replace(/\s\([^)]+\)/g, ''),
    rarity: itemRarity,
  }
  const productId = await getItemId(product)
  document.getElementById('productBaseName').innerHTML = product.name
  document.getElementById('rarityId').innerHTML = product.rarity
  document.getElementById('productId').innerHTML = productId

  const partList = await getPartList(productId)
  printPartList(partList)
  
  const buyList = await getBuyPriceList(productId)
  printBuyOrders(buyList)

  // Trim buy list to contain exactly maxCraft buy orders
  const expandedBuyList = []
  let buyListQty = 0
  for (let iListing in buyList) {
    const qty = buyListQty + buyList[iListing][1] > globalVars().maxCraft
      ? globalVars().maxCraft - buyListQty
      : buyList[iListing][1];
    let numOrder = 0;
    while (numOrder < qty) {
      expandedBuyList.push(buyList[iListing][0]);
      numOrder++;
    }
    buyListQty += qty;
  }

  // Trim sell lists to contain exact amount for crafting maxCraft orders
  let fullSellList = []
  for (let iPart in partList) {
    await getSellPriceList(partList[iPart])
    .then(function (sellList) {
      // Special handling of item which uses karma instead
      if (sellList.length === 0) {
        sellList.push([0, globalVars().maxCraft * partList[iPart].count])
      }
      else {
        let sellQty = 0
        for (let listingIdx in sellList) sellQty += sellList[listingIdx][1]
        sellList[sellList.length - 1][1] -=
            sellQty - partList[iPart].count * globalVars().maxCraft
      }
      fullSellList.push(sellList)
    })
  }
  printSellOrders(fullSellList)

  let numCraft = 0
  let profit = 0
  let iSell = []
  for (let iPart in partList) iSell.push(0);
  // Iterate through buy orders
  for (let iBuy in expandedBuyList) {
    let cost = 0;
    for (let iPart in partList) {
      let qty = 0;
      // If current sell order cannot fill required qty, iterate through
      // until we do
      while (qty + fullSellList[iPart][iSell[iPart]][1] <
          partList[iPart].count) {
        qty += fullSellList[iPart][iSell[iPart]][1];
        cost += fullSellList[iPart][iSell[iPart]][1] *
            fullSellList[iPart][iSell[iPart]][0];
        iSell[iPart]++;
      }
      // add cost of partial sell order
      cost +=
          (partList[iPart].count - qty) * fullSellList[iPart][iSell[iPart]][0];
      fullSellList[iPart][iSell[iPart]][1] -= partList[iPart].count - qty;
    }
    const currProfit = expandedBuyList[iBuy] * 0.85 - cost;
    if (currProfit > 0) {
      profit += currProfit;
      numCraft++;
    }
    else {
      break;
    }
  }
  document.getElementById('numCraft').innerHTML = numCraft
  document.getElementById('profit').innerHTML = profit
}