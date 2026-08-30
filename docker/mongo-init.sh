#!/bin/sh
set -eu

until mongosh --host mongodb:27017 --quiet --eval "db.adminCommand('ping').ok" | grep -q 1; do
  sleep 2
done

mongosh --host mongodb:27017 --quiet --eval '
  try {
    const status = rs.status();
    if (status.ok === 1) quit(0);
  } catch (error) {
    if (!String(error).includes("no replset config")) throw error;
  }
  rs.initiate({ _id: "rs0", members: [{ _id: 0, host: "mongodb:27017" }] });
'

until mongosh --host mongodb:27017 --quiet --eval "rs.status().myState" | grep -q 1; do
  sleep 2
done

echo "MongoDB replica set rs0 is primary"
