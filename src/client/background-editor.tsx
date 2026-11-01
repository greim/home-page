import {
  Box,
  Button,
  chakra,
  HStack,
  Input,
  Popover,
  Portal,
  SimpleGrid,
  Slider,
  Stack,
  Text,
} from "@chakra-ui/react";
import { Effect, Either } from "effect";
import { useEffect, useState } from "react";
import { LuImage, LuImageOff, LuUpload } from "react-icons/lu";
import type { Background } from "../common/model.ts";
import { AdminBarButton } from "./admin-bar.tsx";
import { fetchBackground, listBackgrounds, uploadBackground } from "./api.ts";
import { readFileBytes, run } from "./live.ts";

type Status =
  | { is: "idle" }
  | { is: "busy"; message: string }
  | { is: "failed"; message: string };

function Label(props: { children: string }) {
  return <Text fontSize="sm" fontWeight="semibold" mb="1.5">{props.children}</Text>;
}

/** A square, selectable tile previewing an image (or "none"). */
function ImageTile(props: {
  url: string | null;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <chakra.button
      aspectRatio="1"
      rounded="md"
      borderWidth="1px"
      borderColor="border.emphasized"
      bgImage={props.url === null ? undefined : `url(${props.url})`}
      bgSize="cover"
      bgPos="center"
      display="flex"
      alignItems="center"
      justifyContent="center"
      color="fg.muted"
      cursor="pointer"
      outline={props.selected ? "2px solid" : "none"}
      outlineColor="colorPalette.solid"
      outlineOffset="2px"
      title={props.url ?? "No image"}
      aria-label={props.url ?? "No image"}
      aria-pressed={props.selected}
      onClick={props.onSelect}
    >
      {props.url === null && <LuImageOff />}
    </chakra.button>
  );
}

function BackgroundPanel(props: {
  background: Background;
  onChange: (background: Background) => void;
}) {
  const { background, onChange } = props;
  const [images, setImages] = useState<ReadonlyArray<string>>([]);
  const [status, setStatus] = useState<Status>({ is: "idle" });
  const [remoteUrl, setRemoteUrl] = useState("");

  const refresh = () =>
    run(listBackgrounds).then((r) =>
      Either.isRight(r) ? setImages(r.right) : setStatus({ is: "failed", message: r.left.message })
    );
  useEffect(() => void refresh(), []);

  /** Runs an upload or fetch, then selects the saved image. */
  const addImage = (message: string, save: Promise<Either.Either<string, string>>) => {
    setStatus({ is: "busy", message });
    save.then((result) => {
      if (Either.isLeft(result)) {
        setStatus({ is: "failed", message: result.left });
        return;
      }
      setStatus({ is: "idle" });
      setRemoteUrl("");
      onChange({ ...background, imageUrl: result.right });
      refresh();
    });
  };

  const upload = (file: File) =>
    addImage(
      `Uploading ${file.name}…`,
      run(
        readFileBytes(file).pipe(
          Effect.flatMap((bytes) =>
            uploadBackground(bytes).pipe(Effect.mapError((e) => e.message))
          ),
        ),
      ),
    );

  const fetchRemote = () =>
    addImage(
      "Downloading…",
      run(fetchBackground(remoteUrl).pipe(Effect.mapError((e) => e.message))),
    );

  const busy = status.is === "busy";

  return (
    <Stack gap="5">
      <Box>
        <Label>Image</Label>
        <SimpleGrid columns={5} gap="2" maxH="44" overflowY="auto" p="1">
          <ImageTile
            url={null}
            selected={background.imageUrl === null}
            onSelect={() => onChange({ ...background, imageUrl: null })}
          />
          {images.map((url) => (
            <ImageTile
              key={url}
              url={url}
              selected={background.imageUrl === url}
              onSelect={() => onChange({ ...background, imageUrl: url })}
            />
          ))}
        </SimpleGrid>
        <Stack gap="2" mt="3">
          <Button as="label" size="sm" variant="outline" disabled={busy} cursor="pointer">
            <LuUpload /> Upload from disk…
            <chakra.input
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
              display="none"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.item(0);
                e.target.value = "";
                if (file) upload(file);
              }}
            />
          </Button>
          <chakra.form
            display="flex"
            gap="2"
            onSubmit={(e) => {
              e.preventDefault();
              fetchRemote();
            }}
          >
            <Input
              size="sm"
              placeholder="https://… image URL"
              value={remoteUrl}
              disabled={busy}
              onChange={(e) => setRemoteUrl(e.target.value)}
            />
            <Button type="submit" size="sm" variant="outline" disabled={busy || !remoteUrl.trim()}>
              Fetch
            </Button>
          </chakra.form>
          {status.is !== "idle" && (
            <Text fontSize="xs" color={status.is === "failed" ? "fg.error" : "fg.muted"}>
              {status.message}
            </Text>
          )}
        </Stack>
      </Box>

      <Box>
        <Label>Color</Label>
        <HStack gap="2">
          <chakra.input
            type="color"
            value={background.color}
            onChange={(e) => onChange({ ...background, color: e.target.value })}
            boxSize="8"
            p="0"
            borderWidth="0"
            bg="transparent"
            cursor="pointer"
            aria-label="Background color"
          />
          <Text fontSize="sm" fontFamily="mono">{background.color}</Text>
        </HStack>
      </Box>

      <Box>
        <HStack justify="space-between">
          <Label>Image opacity</Label>
          <Text fontSize="sm" color="fg.muted">{Math.round(background.opacity * 100)}%</Text>
        </HStack>
        <Slider.Root
          size="sm"
          min={0}
          max={100}
          step={1}
          value={[Math.round(background.opacity * 100)]}
          disabled={background.imageUrl === null}
          onValueChange={(e) => onChange({ ...background, opacity: (e.value.at(0) ?? 100) / 100 })}
        >
          <Slider.Control>
            <Slider.Track>
              <Slider.Range />
            </Slider.Track>
            <Slider.Thumbs />
          </Slider.Control>
        </Slider.Root>
      </Box>
    </Stack>
  );
}

/** Admin bar button that opens the background settings, applied live as you edit. */
export function BackgroundEditor(props: {
  background: Background;
  onChange: (background: Background) => void;
}) {
  return (
    <Popover.Root positioning={{ placement: "bottom-start" }} lazyMount unmountOnExit>
      <Popover.Trigger asChild>
        <AdminBarButton>
          <LuImage /> Background
        </AdminBarButton>
      </Popover.Trigger>
      <Portal>
        <Popover.Positioner>
          <Popover.Content width="sm">
            <Popover.Body>
              <BackgroundPanel background={props.background} onChange={props.onChange} />
            </Popover.Body>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}
