/* global JitsiMeetJS config*/
import React, { useState, useCallback, useEffect, useMemo } from "react";
import "./App.css";
import $ from "jquery";
import { Seat } from "./components/Seat";
import { ConnectForm } from "./components/ConnectForm";
import { Audio } from "./components/Audio";
import useWindowSize from "./hooks/useWindowSize";

import qs from "qs";
// import { withThemeCreator } from "@material-ui/styles";

window.$ = $;

const connect = async ({ domain, room, name, config }) => {
  const connectionConfig = Object.assign({}, config);
  let serviceUrl = connectionConfig.bosh || connectionConfig.websocket;

  serviceUrl += `?room=${room}`;
  if (serviceUrl.indexOf("//") === 0) {
    serviceUrl = `https:${serviceUrl}`;
  }
  connectionConfig.serviceUrl = connectionConfig.bosh = serviceUrl;

  return new Promise((resolve, reject) => {
    const connection = new JitsiMeetJS.JitsiConnection(
      null,
      undefined,
      connectionConfig
    );
    console.log(
      "JitsiMeetJS.events.connection.CONNECTION_ESTABLISHED",
      JitsiMeetJS.events.connection.CONNECTION_ESTABLISHED
    );
    connection.addEventListener(
      JitsiMeetJS.events.connection.CONNECTION_ESTABLISHED,
      () => resolve(connection)
    );
    connection.addEventListener(
      JitsiMeetJS.events.connection.CONNECTION_FAILED,
      reject
    );
    connection.connect();
  });
};

const join = async ({ connection, room, name }) => {
  const conference = connection.initJitsiConference(room, {});
  conference.setDisplayName(name);
  return new Promise((resolve) => {
    conference.on(JitsiMeetJS.events.conference.CONFERENCE_JOINED, () =>
      resolve(conference)
    );
    conference.join();
  });
};

const connectandJoin = async ({ domain, room, name, config }) => {
  const connection = await connect({ domain, room, name, config });
  const localTracks = await JitsiMeetJS.createLocalTracks(
    { devices: ["video", "audio"], facingMode: "user" },
    true
  );

  const conference = await join({ connection, room, name });
  const localTrack = localTracks.find((track) => track.getType() === "video");
  conference.addTrack(localTrack);
  const localAudioTrack = localTracks.find(
    (track) => track.getType() === "audio"
  );
  conference.addTrack(localAudioTrack);

  return { connection, conference, localTrack };
};

const loadAndConnect = ({ domain, room, name }) => {
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.onload = () => {
      JitsiMeetJS.init();

      const configScript = document.createElement("script");
      configScript.src = `https://${domain}/config.js`;
      document.querySelector("head").appendChild(configScript);
      configScript.onload = () => {
        connectandJoin({ domain, room, name, config }).then(resolve);
      };
    };

    script.src = `https://${domain}/libs/lib-jitsi-meet.min.js`;
    document.querySelector("head").appendChild(script);
  });
};

const useTracks = () => {
  const [tracks, setTracks] = useState([]);

  const addTrack = useCallback(
    (track) => {
      setTracks((tracks) => {
        const hasTrack = tracks.find(
          (_track) => track.getId() === _track.getId()
        );

        if (hasTrack) return tracks;

        return [...tracks, track];
      });
    },
    [setTracks]
  );

  const removeTrack = useCallback(
    (track) => {
      setTracks((tracks) =>
        tracks.filter((_track) => track.getId() !== _track.getId())
      );
    },
    [setTracks]
  );

  return [tracks, addTrack, removeTrack];
};

const getDefaultParamsValue = () => {
  const params =
    document.location.search.length > 1
      ? qs.parse(document.location.search.slice(1))
      : {};
  return {
    room: params.room ?? "daily_standup",
    domain: params.domain ?? "meet.jit.si",
    name: params.name ?? "name",
    autoJoin: params.autojoin ?? false,
  };
};

function App() {
  useWindowSize();
  const defaultParams = useMemo(getDefaultParamsValue, []);

  const [mainState, setMainState] = useState("init");
  const [domain, setDomain] = useState(defaultParams.domain);
  const [room, setRoom] = useState(defaultParams.room);
  const [name, setName] = useState(defaultParams.name);
  const [conference, setConference] = useState(null);
  const [videoTracks, addVideoTrack, removeVideoTrack] = useTracks();
  const [audioTracks, addAudioTrack, removeAudioTrack] = useTracks();

  const addTrack = useCallback(
    (track) => {
      if (track.getType() === "video") addVideoTrack(track);
      if (track.getType() === "audio") addAudioTrack(track);
    },
    [addVideoTrack, addAudioTrack]
  );

  const removeTrack = useCallback(
    (track) => {
      if (track.getType() === "video") removeVideoTrack(track);
      if (track.getType() === "audio") removeAudioTrack(track);
    },
    [removeAudioTrack, removeVideoTrack]
  );

  const connect = useCallback(
    async (e) => {
      e && e.preventDefault();
      setMainState("loading");
      const { /* connection, */ conference, localTrack } = await loadAndConnect(
        {
          domain,
          room,
          name,
        }
      );
      setMainState("started");
      setConference(conference);
      addTrack(localTrack);
    },
    [addTrack, domain, room, name]
  );
  
  const userAdded = useCallback((id, { _displayName }) => {
    console.error("USER_JOINED", id, _displayName);
  }, []);

  useEffect(() => {
    if (!conference) return;

    conference.on(JitsiMeetJS.events.conference.TRACK_ADDED, addTrack);
    conference.on(JitsiMeetJS.events.conference.TRACK_REMOVED, removeTrack);
    conference.on(JitsiMeetJS.events.conference.USER_JOINED, userAdded);
  }, [userAdded, addTrack, conference, removeTrack]);

  useEffect(() => {
    if (defaultParams.autoJoin || defaultParams.autoJoin === "") {
      connect();
    }
  }, [connect, defaultParams.autoJoin]);

  return (
    <div className="App">
      <header className="App-header">
        {mainState === "init" && (
          <ConnectForm
            connect={connect}
            domain={domain}
            name={name}
            room={room}
            setRoom={setRoom}
            setDomain={setDomain}
            setName={setName}
          />
        )}
        {mainState === "loading" && "Loading"}
        {mainState === "started" && (
          <div
            style={{
              height: "100vh",
              width: "100vw",
              maxHeight: "100vw",
              maxWidth: "100vh",
              background: "rgba(0, 100,100, 1)",
              position: "relative",
              borderRadius: "100%",
            }}
          >
            {videoTracks
              .sort((t1, t2) => {
                if (t1.getParticipantId() < t2.getParticipantId()) {
                  return -1;
                } else if (t1.getParticipantId() > t2.getParticipantId()) {
                  return 1;
                } else {
                  return 0;
                }
              })
              .map((track, index) => {
                let conferenceTrackUser = null;
                if (conference) {
                  if (track.getParticipantId() === conference.myUserId()) {
                    conferenceTrackUser = {
                      id: track.getParticipantId(),
                      name,
                    };
                  } else {
                    const filterResult = conference
                      .getParticipants()
                      .filter((p) => p._id === track.getParticipantId())
                      .map((p) => ({
                        id: p._id,
                        name: p._displayName,
                      }));
                    if (filterResult.length > 0) {
                      conferenceTrackUser = filterResult[0];
                    }
                  }
                }

                const defaultTrackUser = {
                  id: track.getParticipantId(),
                  name: "user" + (index + 1),
                };
                const user = conferenceTrackUser || defaultTrackUser;
                return (
                  <Seat
                    track={track}
                    index={index}
                    length={videoTracks.length}
                    user={user}
                    key={track.getId()}
                  />
                );
              })}
            {audioTracks.map((track, index) => (
              <Audio track={track} index={index} key={track.getId()} />
            ))}
          </div>
        )}
      </header>
    </div>
  );
}

export default App;
