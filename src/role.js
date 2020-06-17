const got = require('got')

async function pullData() {
  const url = 'http://cdn.merakianalytics.com/riot/lol/resources/latest/en-US/championrates.json'
  const data = {}
  const response = await got(url, { responseType: 'json' });  
  for (const [championId, roles] of Object.entries(response.body.data)) {
    const playRates = {}

    for (const [position, rates] of Object.entries(roles)) {
      playRates[position.toUpperCase()] = rates['playRate']
    }

    for (const position of ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY']) {
      if (playRates[position] === undefined) {
        playRates[position] = 0
      }
    }

    data[championId] = playRates
  }

  return data
}

function getPermutations(array) {
  const result = [];

  for (let i = 0; i < array.length; i++) {
    const rest = getPermutations(array.slice(0, i).concat(array.slice(i + 1)));

    if (!rest.length) {
      result.push([array[i]])
    } else {
      for (let j = 0; j < rest.length; j++) {
        result.push([array[i]].concat(rest[j]))
      }
    }
  }
  return result;
}

function calculateMetric(championPositions, bestPositions) {
  //console.log('f1');  
  //console.log(bestPositions);
  return Object.entries(bestPositions).reduce((agg, [position, champion]) => {
    //console.log(agg);
    //console.log(position);
    console.log(champion);
    //console.log('oooo weee');
    //console.log(agg);
    if (champion != null) {
    return agg + (championPositions[champion][position] || 0)}
    else {return 0;}
  }, 0) / Object.keys(bestPositions).length
}

function calculateConfidence(bestMetric, secondBestMetric) {
  return (bestMetric - secondBestMetric) / bestMetric * 100
}

function getPositions(championPositions, composition, top, jungle, middle, adc, support) {
  // Set the initial guess to be the champion in the composition, order doesn't matter
  //console.log('1');
  let bestPositions = {
    'TOP': composition[0],
    'JUNGLE': composition[1],
    'MIDDLE': composition[2],
    'BOTTOM': composition[3],
    'UTILITY': composition[4]
  }
  //console.log(championPositions);
  //console.log(bestPositions);
  let bestMetric = calculateMetric(championPositions, bestPositions)

  let secondBestMetric = -Infinity
  let secondBestPositions = null
  // Figure out which champions and positions we need to fill
  const knownChampions = [top, jungle, middle, adc, support].filter(Boolean)
  const unknownChampions = composition.filter(champ => !knownChampions.includes(champ))
  const unknownPositions = Object.entries({ 'TOP': top, 'JUNGLE': jungle, 'MIDDLE': middle, 'BOTTOM': adc, 'UTILITY': support })
    .filter(pos => !pos[1])
    .map(pos => pos[0])
    //console.log('4');
  const testComposition = {
    'TOP': top,
    'JUNGLE': jungle,
    'MIDDLE': middle,
    'BOTTOM': adc,
    'UTILITY': support
  }
//console.log('123');
  // Iterate over the positions we need to fill and record how well each composition "performs"
  for (const champs of getPermutations(unknownChampions)) {
    for (let [i, position] of unknownPositions.entries()) {
      testComposition[position] = champs[i]
    }
    //console.log('123');
    const metric = calculateMetric(championPositions, testComposition)
    //console.log(bestMetric);
    //console.log(metric);
    //console.log(secondBestMetric);

    if (metric > bestMetric) {
      secondBestMetric = bestMetric
      secondBestPositions = bestPositions
      bestMetric = metric
      bestPositions = { ...testComposition }
    }

    if (bestMetric > metric && metric > secondBestMetric) {
      secondBestMetric = metric
      secondBestPositions = { ...testComposition }
    }
  }

  const bestPlayPercents = {}
  for (const [position, champion] of Object.entries(bestPositions)) {
    bestPlayPercents[champion] = championPositions[champion][position]
  }

  let secondBestPlayPercents = null
  if (secondBestPositions !== null) {
    secondBestPlayPercents = {}
    for (const [position, champion] of Object.entries(secondBestPositions)) {
      secondBestPlayPercents[champion] = championPositions[champion][position]
    }
  }

  if (JSON.stringify(secondBestPositions) === JSON.stringify(bestPositions)) {
    secondBestPositions = null
    secondBestPlayPercents = null
    secondBestMetric = -Infinity
  }

  // let countBadAssignments = 0
  // for (const value of Object.values(bestPlayPercents)) {
  //   if(value < 0) {
  //     countBadAssignments++
  //   }
  // }

  const foundAcceptableAlternative = secondBestPlayPercents !== null
  let confidence = 0
  if (foundAcceptableAlternative) {
    confidence = calculateConfidence(bestMetric, secondBestMetric)
  }

  return { bestPositions, bestMetric, confidence, secondBestPositions }
}

function getRoles(championPositions, composition) {
  const identified = {}
  let positions = {}
  let secondaryPositions = null
  let secondaryMetric = -Infinity

  while (Object.keys(identified).length < composition.length - 1) {
    let { bestPositions, bestMetric: metric, confidence, secondBestPositions: sbp } =
      getPositions(championPositions, composition, identified.TOP, identified.JUNGLE, identified.MIDDLE, identified.ADC, identified.SUPPORT)

    positions = bestPositions

    if (sbp !== null) {
      let _metric = calculateMetric(championPositions, { ...sbp })

      if (secondaryPositions === null) {
        secondaryPositions = sbp
        secondaryMetric = _metric
      } else if (metric > _metric && _metric > secondaryMetric) {
        secondaryMetric = _metric
        secondaryPositions = sbp
      }
    }

    // Done! Grab the results.
    const positionsWithMetric = {}
    for (const [position, champion] of Object.entries(positions)) {
      if (Object.keys(identified).includes(position)) {
        continue
      }
      positionsWithMetric[position] = {
        champion,
        metric: championPositions[champion][position]
      }
    }
    const bestPosition = Object.keys(positionsWithMetric).reduce((posA, posB) => {
      return positionsWithMetric[posA].metric > positionsWithMetric[posB].metric ? posA : posB
    })

    const best = [bestPosition, positionsWithMetric[bestPosition].champion]
    identified[best[0]] = best[1]
    confidence = calculateConfidence(metric, secondaryMetric)
  }

  return positions
}

module.exports = {
  pullData,
  getRoles
}