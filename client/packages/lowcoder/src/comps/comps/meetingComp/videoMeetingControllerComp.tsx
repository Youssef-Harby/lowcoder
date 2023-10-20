import { CloseOutlined } from "@ant-design/icons";
import { Button } from "antd";
import { ContainerCompBuilder } from "comps/comps/containerBase/containerCompBuilder";
import {
  gridItemCompToGridItems,
  InnerGrid,
} from "comps/comps/containerComp/containerView";
import { AutoHeightControl } from "comps/controls/autoHeightControl";
import { BoolControl } from "comps/controls/boolControl";
import { StringControl } from "comps/controls/codeControl";
import {
  booleanExposingStateControl,
  jsonObjectExposingStateControl,
  numberExposingStateControl,
  stringExposingStateControl,
} from "comps/controls/codeStateControl";
import { PositionControl } from "comps/controls/dropdownControl";
import {
  closeEvent,
  eventHandlerControl,
} from "comps/controls/eventHandlerControl";
import { styleControl } from "comps/controls/styleControl";
import { DrawerStyle } from "comps/controls/styleControlConstants";
import { stateComp, withDefault } from "comps/generators";
import { withMethodExposing } from "comps/generators/withMethodExposing";
import { BackgroundColorContext } from "comps/utils/backgroundColorContext";
import { CanvasContainerID } from "constants/domLocators";
import { Layers } from "constants/Layers";
import { trans } from "i18n";
import { changeChildAction } from "lowcoder-core";
import {
  Drawer,
  HintPlaceHolder,
  Section,
  sectionNames,
} from "lowcoder-design";
import { useCallback, useEffect, useState } from "react";
import { ResizeHandle } from "react-resizable";
import styled from "styled-components";
import { useUserViewMode } from "util/hooks";
import { isNumeric } from "util/stringUtils";
import { NameConfig, withExposingConfigs } from "../../generators/withExposing";

import AgoraRTC, {
  ICameraVideoTrack,
  IMicrophoneAudioTrack,
  IAgoraRTCClient,
  IAgoraRTCRemoteUser,
  UID,
  ILocalVideoTrack,
} from "agora-rtc-sdk-ng";

import { JSONValue } from "@lowcoder-ee/index.sdk";
import { getData } from "../listViewComp/listViewUtils";

const EventOptions = [closeEvent] as const;

const DEFAULT_SIZE = 378;
const DEFAULT_PADDING = 16;

const DrawerWrapper = styled.div`
  // Shield the mouse events of the lower layer, the mask can be closed in the edit mode to prevent the lower layer from sliding
  pointer-events: auto;
`;

const ButtonStyle = styled(Button)`
  position: absolute;
  left: 0;
  top: 0;
  z-index: 10;
  font-weight: 700;
  box-shadow: none;
  color: rgba(0, 0, 0, 0.45);
  height: 54px;
  width: 54px;

  svg {
    width: 16px;
    height: 16px;
  }

  &,
  :hover,
  :focus {
    background-color: transparent;
    border: none;
  }

  :hover,
  :focus {
    color: rgba(0, 0, 0, 0.75);
  }
`;

// If it is a number, use the px unit by default
function transToPxSize(size: string | number) {
  return isNumeric(size) ? size + "px" : (size as string);
}

export const client: IAgoraRTCClient = AgoraRTC.createClient({
  mode: "rtc",
  codec: "vp8",
});
let audioTrack: IMicrophoneAudioTrack;
let videoTrack: ICameraVideoTrack;
let screenShareStream: ILocalVideoTrack;
let userId: UID | null | undefined;

const turnOnCamera = async (flag?: boolean) => {
  if (videoTrack) {
    return videoTrack.setEnabled(flag!);
  }
  videoTrack = await AgoraRTC.createCameraVideoTrack();
  videoTrack.play(userId + "");
};

const turnOnMicrophone = async (flag?: boolean) => {
  if (audioTrack) {
    return audioTrack.setEnabled(flag!);
  }
  audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
  // audioTrack.play();

  if (!flag) {
    await client.unpublish(audioTrack);
  } else {
    await client.publish(audioTrack);
  }
};
const shareScreen = async (sharing: boolean) => {
  try {
    if (sharing == false) {
      await client.unpublish(screenShareStream);
      await client.publish(videoTrack);
      videoTrack.play(userId + "");
    } else {
      screenShareStream = await AgoraRTC.createScreenVideoTrack(
        {
          screenSourceType: "screen",
        },
        "disable"
      );
      await client.unpublish(videoTrack);
      screenShareStream.play(userId + "");
      await client.publish(screenShareStream);
    }
  } catch (error) {
    console.error("Failed to create screen share stream:", error);
  }
};
const leaveChannel = async () => {
  if (videoTrack) {
    await client.unpublish(videoTrack);
    await turnOnCamera(false);
  }

  if (audioTrack) {
    await turnOnMicrophone(false);
  }
  await client.leave();
};

const hostChanged = (users: any) => {};

const publishVideo = async (appId: any, channel: any, height: any) => {
  await turnOnCamera(true);
  await client.join(appId, channel, null, userId);
  await client.publish(videoTrack);

  const mediaStreamTrack = videoTrack.getMediaStreamTrack();
  if (mediaStreamTrack) {
    const videoSettings = mediaStreamTrack.getSettings();
    const videoWidth = videoSettings.width;
    const videoHeight = videoSettings.height;
    height.videoWidth.change(videoWidth);
    height.videoHeight.change(videoHeight);
  }
};

export const meetingControllerChildren = {
  visible: booleanExposingStateControl("visible"),
  onEvent: eventHandlerControl(EventOptions),
  width: StringControl,
  height: StringControl,
  autoHeight: AutoHeightControl,
  style: styleControl(DrawerStyle),
  placement: PositionControl,
  maskClosable: withDefault(BoolControl, true),
  showMask: withDefault(BoolControl, true),
  audioControl: booleanExposingStateControl("false"),
  videoControl: booleanExposingStateControl("true"),
  endCall: booleanExposingStateControl("false"),
  sharing: booleanExposingStateControl("false"),
  videoSettings: jsonObjectExposingStateControl(""),
  videoWidth: numberExposingStateControl("videoWidth", 200),
  videoHeight: numberExposingStateControl("videoHeight", 200),
  appId: withDefault(StringControl, trans("meeting.appid")),
  participants: stateComp<JSONValue>([]),
  usersScreenShared: stateComp<JSONValue>([]),
  localUser: jsonObjectExposingStateControl(""),
  meetingName: stringExposingStateControl("meetingName"),
};
let MTComp = (function () {
  return new ContainerCompBuilder(
    meetingControllerChildren,
    (props, dispatch) => {
      const isTopBom = ["top", "bottom"].includes(props.placement);
      const { items, ...otherContainerProps } = props.container;
      const userViewMode = useUserViewMode();
      const resizable = !userViewMode && (!isTopBom || !props.autoHeight);
      const onResizeStop = useCallback(
        (
          e: React.SyntheticEvent,
          node: HTMLElement,
          size: { width: number; height: number },
          handle: ResizeHandle
        ) => {
          isTopBom
            ? dispatch(changeChildAction("height", size.height, true))
            : dispatch(changeChildAction("width", size.width, true));
        },
        [dispatch, isTopBom]
      );
      const [userIds, setUserIds] = useState<any>([]);

      useEffect(() => {
        dispatch(
          changeChildAction("participants", getData(userIds).data, false)
        );
      }, [userIds]);

      useEffect(() => {
        if (props.endCall.value) {
          let newUsers = userIds.filter((item: any) => item.user !== userId);
          dispatch(
            changeChildAction("participants", getData(newUsers).data, false)
          );
        }
      }, [props.endCall.value]);

      useEffect(() => {
        client.on("user-joined", (user: IAgoraRTCRemoteUser) => {
          let userData = {
            user: user.uid,
            host: false,
            audiostatus: user.hasVideo,
          };
          if (userIds.length == 0) {
            userData.host = true;
          } else {
            userData.host = false;
          }
          setUserIds((userIds: any) => [...userIds, userData]);
        });
        client.on("user-left", (user: IAgoraRTCRemoteUser, reason: any) => {
          let newUsers = userIds.filter((item: any) => item.user !== user.uid);
          let hostExists = newUsers.filter((f: any) => f.host === true);
          if (hostExists.length == 0 && newUsers.length > 0) {
            newUsers[0].host = true;
            hostChanged(newUsers);
          }
          setUserIds(newUsers);
        });
      }, [client]);

      return (
        <BackgroundColorContext.Provider value={props.style.background}>
          <DrawerWrapper>
            <Drawer
              resizable={resizable}
              onResizeStop={onResizeStop}
              rootStyle={
                props.visible.value
                  ? { overflow: "auto", pointerEvents: "auto" }
                  : {}
              }
              contentWrapperStyle={{ maxHeight: "100%", maxWidth: "100%" }}
              bodyStyle={{
                padding: 0,
                backgroundColor: props.style.background,
              }}
              closable={false}
              placement={props.placement}
              open={props.visible.value}
              getContainer={() =>
                document.querySelector(`#${CanvasContainerID}`) || document.body
              }
              footer={null}
              width={transToPxSize(props.width || DEFAULT_SIZE)}
              height={
                !props.autoHeight
                  ? transToPxSize(props.height || DEFAULT_SIZE)
                  : ""
              }
              onClose={(e) => {
                props.visible.onChange(false);
              }}
              afterOpenChange={(visible) => {
                if (!visible) {
                  props.onEvent("close");
                }
              }}
              zIndex={Layers.drawer}
              maskClosable={props.maskClosable}
              mask={props.showMask}
            >
              <ButtonStyle
                onClick={() => {
                  props.visible.onChange(false);
                }}
              >
                <CloseOutlined />
              </ButtonStyle>
              <InnerGrid
                {...otherContainerProps}
                items={gridItemCompToGridItems(items)}
                autoHeight={props.autoHeight}
                minHeight={isTopBom ? DEFAULT_SIZE + "px" : "100%"}
                style={{ height: "100%" }}
                containerPadding={[DEFAULT_PADDING, DEFAULT_PADDING]}
                hintPlaceholder={HintPlaceHolder}
                bgColor={props.style.background}
              />
            </Drawer>
          </DrawerWrapper>
        </BackgroundColorContext.Provider>
      );
    }
  )
    .setPropertyViewFn((children) => (
      <>
        <Section name={sectionNames.basic}>
          {children.appId.propertyView({ label: trans("meeting.appid") })}
          {children.meetingName.propertyView({
            label: trans("meeting.meetingName"),
          })}
          {children.placement.propertyView({
            label: trans("drawer.placement"),
            radioButton: true,
          })}
          {["top", "bottom"].includes(children.placement.getView())
            ? children.autoHeight.getPropertyView()
            : children.width.propertyView({
                label: trans("drawer.width"),
                tooltip: trans("drawer.widthTooltip"),
                placeholder: DEFAULT_SIZE + "",
              })}
          {!children.autoHeight.getView() &&
            ["top", "bottom"].includes(children.placement.getView()) &&
            children.height.propertyView({
              label: trans("drawer.height"),
              tooltip: trans("drawer.heightTooltip"),
              placeholder: DEFAULT_SIZE + "",
            })}
          {children.maskClosable.propertyView({
            label: trans("prop.maskClosable"),
          })}
          {children.showMask.propertyView({
            label: trans("prop.showMask"),
          })}
        </Section>
        <Section name={sectionNames.interaction}>
          {children.onEvent.getPropertyView()}
        </Section>
        <Section name={sectionNames.style}>
          {children.style.getPropertyView()}
        </Section>
      </>
    ))
    .build();
})();

MTComp = class extends MTComp {
  override autoHeight(): boolean {
    return false;
  }
};

MTComp = withMethodExposing(MTComp, [
  {
    method: {
      name: "openDrawer",
      description: trans("drawer.openDrawerDesc"),
      params: [],
    },
    execute: (comp, values) => {
      comp.children.visible.getView().onChange(true);
    },
  },
  {
    method: {
      name: "startSharing",
      description: trans("drawer.openDrawerDesc"),
      params: [],
    },
    execute: async (comp, values) => {
      let sharing = !comp.children.sharing.getView().value;
      await shareScreen(sharing);
      comp.children.sharing.change(sharing);
    },
  },
  {
    method: {
      name: "audioControl",
      description: trans("meeting.actionBtnDesc"),
      params: [],
    },
    execute: async (comp, values) => {
      let value = !comp.children.audioControl.getView().value;
      let localUserData = comp.children.localUser.change({
        user: userId + "",
        audiostatus: value,
      });
      console.log(localUserData);
      await turnOnMicrophone(value);
      comp.children.audioControl.change(value);
    },
  },
  {
    method: {
      name: "videoControl",
      description: trans("meeting.actionBtnDesc"),
      params: [],
    },
    execute: async (comp, values) => {
      let value = !comp.children.videoControl.getView().value;
      if (videoTrack) {
        videoTrack.setEnabled(value);
      } else {
        await turnOnCamera(value);
      }

      comp.children.videoControl.change(value);
    },
  },
  {
    method: {
      name: "startMeeting",
      description: trans("meeting.actionBtnDesc"),
      params: [],
    },
    execute: async (comp, values) => {
      userId = Math.floor(100000 + Math.random() * 900000);
      comp.children.localUser.change({
        user: userId + "",
        audiostatus: false,
      });
      await publishVideo(
        comp.children.appId.getView(),
        comp.children.meetingName.getView().value == ""
          ? "_meetingId"
          : comp.children.meetingName.getView().value,
        comp.children
      );
    },
  },
  {
    method: {
      name: "endMeeting",
      description: trans("meeting.actionBtnDesc"),
      params: [],
    },
    execute: async (comp, values) => {
      let value = !comp.children.endCall.getView().value;
      comp.children.endCall.change(value);
      await leaveChannel();
    },
  },
  {
    method: {
      name: "closeDrawer",
      description: trans("drawer.closeDrawerDesc"),
      params: [],
    },
    execute: (comp, values) => {
      comp.children.visible.getView().onChange(false);
    },
  },
]);

export const VideoMeetingControllerComp = withExposingConfigs(MTComp, [
  new NameConfig("visible", trans("export.visibleDesc")),
  new NameConfig("appId", trans("meeting.appid")),
  new NameConfig("localUser", trans("meeting.host")),
  new NameConfig("participants", trans("meeting.participants")),
  new NameConfig("meetingName", trans("meeting.meetingName")),
]);

export function agoraClient() {
  return client;
}