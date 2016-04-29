#!/usr/bin/node

var compare = function (a,b) {
  if (a.name < b.name)
    return -1;
  else if (a.name > b.name)
    return 1;
  else 
    return 0;
}


var o1 = {
    a : [
        {
            name: "something",
            value: true
        },
        {
            name: "else",
            value: false
        }
    ]
}

var o2 = {
    a : [
        {
            name: "else",
            value: false
        },
        {
            name: "something",
            value: true
        }
    ]
}

o1.a.sort(function(a,b){
    if (a.name < b.name) {
        return -1
    } else if (a.name > b.name) {
        return 1
    } else {
        return 0
    }
})
o2.a.sort(function(a,b){
    if (a.name < b.name) {
        return -1
    } else if (a.name > b.name) {
        return 1
    } else {
        return 0
    }
})
for (s = 0; s < o2.a.length; s++) {
    if (o2.a[s].value != o1.a[s].value) {
        console.log(false)
    }
}